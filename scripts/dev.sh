#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for dependency in node npm; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
        printf 'Missing required command: %s. Make it available on PATH and retry.\n' "$dependency" >&2
        exit 127
    fi
done
if [[ ! -d node_modules ]]; then
    printf 'Project dependencies are missing. Run npm clean-install from the repository root.\n' >&2
    exit 1
fi

start_website() {
    local exit_status
    printf 'Starting the website with live reloading.\n'
    if npm exec -- next dev "$@"; then
        return 0
    else
        exit_status=$?
    fi
    if [[ "$exit_status" != 130 && "$exit_status" != 143 ]]; then
        printf 'Website exited with status %s. Review the Next.js error above and retry npm run dev. If its port is occupied, stop the process using it or choose another port with npm run dev -- --port 3001.\n' "$exit_status" >&2
    fi
    return "$exit_status"
}
start_without_services() {
    printf 'Starting the website without backing services. Page counts and feedback will be unavailable.\n'
    start_website "$@"
    exit 0
}
if [[ "${1:-}" == --without-services ]]; then
    shift
    start_without_services "$@"
fi
if command -v docker >/dev/null 2>&1; then
    container_engine=docker
elif command -v podman >/dev/null 2>&1; then
    container_engine=podman
else
    printf 'No container engine found. Install Docker or Podman with Compose support and make it available on PATH, then retry npm run dev.\n' >&2
    start_without_services "$@"
fi
if ! "$container_engine" compose version >/dev/null; then
    printf 'Cannot run %s Compose. Install or repair its Compose provider, verify with %s compose version, then retry npm run dev.\n' "$container_engine" "$container_engine" >&2
    start_without_services "$@"
fi
if ! "$container_engine" info >/dev/null; then
    if [[ "$container_engine" == podman ]]; then
        printf 'Cannot connect to Podman. On macOS or Windows, start its machine with podman machine start. Check the connection with podman info, then retry npm run dev.\n' >&2
    else
        printf 'Cannot connect to Docker. Start Docker Desktop or the Docker daemon and check your connection and permissions with docker info, then retry npm run dev.\n' >&2
    fi
    start_without_services "$@"
fi
if ! command -v openssl >/dev/null 2>&1; then
    printf 'Missing openssl for local service credentials. Install OpenSSL and make it available on PATH, then retry npm run dev.\n' >&2
    start_without_services "$@"
fi

compose() {
    "$container_engine" compose "$@"
}
export COMPOSE_FILE=compose.yaml:development/compose.yaml
printf 'Preparing local service credentials in .env with owner-only file permissions.\n'
umask 077
touch .env
chmod 600 .env
for credential in STORAGE_SERVICE_TOKEN POSTGRES_PASSWORD; do
    if [[ -n "${!credential:-}" ]] || grep -q "^${credential}=" .env; then
        printf 'Reusing %s from the environment or .env.\n' "$credential"
    else
        generated_secret=$(openssl rand -hex 32)
        printf '\n%s=%s\n' "$credential" "$generated_secret" >> .env
        printf 'Generated and saved a random %s for subsequent sessions.\n' "$credential"
    fi
done
STORAGE_SERVICE_TOKEN=$(node --env-file=.env --print 'process.env.STORAGE_SERVICE_TOKEN')
export STORAGE_SERVICE_TOKEN
export STORAGE_SERVICE_URL=http://127.0.0.1:10001 STORAGE_ALLOW_HTTP=true

report_service_failure() {
    printf 'Could not start local services: %s. Review the error or container status above.\n' "$*" >&2
    printf 'Inspect container status: %s compose --file compose.yaml --file development/compose.yaml ps\n' "$container_engine" >&2
    printf 'Inspect their logs: %s compose --file compose.yaml --file development/compose.yaml logs --tail 50 %s\n' "$container_engine" "$*" >&2
    printf 'Correct the reported problem, then stop this development session and retry npm run dev. For an occupied port, stop the conflicting process or container first.\n' >&2
}

service_container() {
    local service=$1 identifiers identifier container_service
    identifiers=$(compose ps --quiet) || return 1
    for identifier in $identifiers; do
        container_service=$("$container_engine" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$identifier") || return 1
        if [[ "$container_service" == "$service" ]]; then
            printf '%s\n' "$identifier"
            return 0
        fi
    done
    return 1
}

wait_for_service() {
    local service=$1 identifier state container_status health_status attempt
    if ! identifier=$(service_container "$service") || [[ -z "$identifier" ]]; then
        printf 'No container could be found for %s.\n' "$service" >&2
        return 1
    fi
    for ((attempt=0; attempt<60; attempt++)); do
        if ! state=$("$container_engine" inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$identifier"); then
            printf 'Could not inspect the %s container.\n' "$service" >&2
            return 1
        fi
        read -r container_status health_status <<< "$state"
        if [[ "$container_status" == running && -z "$health_status" ]]; then
            printf '%s has no container health check; refusing to report it as ready.\n' "$service" >&2
            return 1
        fi
        if [[ "$container_status" == running && "$health_status" == healthy ]]; then
            if [[ "$service" == storage ]] && ! "$container_engine" exec "$identifier" node scripts/health-check.mjs http://127.0.0.1:10000/health/ready; then
                printf 'Storage cannot use PostgreSQL. Check database logs for authentication or schema errors. Existing database volumes retain their original accounts and passwords; restore matching credentials or migrate the database account.\n' >&2
                return 1
            fi
            printf 'Local service %s is running%s.\n' "$service" "${health_status:+ and healthy}"
            return 0
        fi
        if [[ "$container_status" == restarting || "$container_status" == exited || "$container_status" == dead || "$health_status" == unhealthy ]]; then
            printf '%s: %s\n' "$service" "$state" >&2
            return 1
        fi
        sleep 1
    done
    printf '%s did not become ready after 60 checks, one second apart. Last container status: %s\n' "$service" "$state" >&2
    return 1
}

start_services() {
    local service failed=0
    printf 'Building and starting local services: %s.\n' "$*"
    if ! compose up --detach --build --force-recreate --remove-orphans "$@"; then
        report_service_failure "$@"
        return 1
    fi
    for service in "$@"; do
        if ! wait_for_service "$service"; then
            if [[ "$service" == storage ]]; then
                report_service_failure database storage
            else
                report_service_failure "$service"
            fi
            failed=1
        fi
    done
    return "$failed"
}


cleanup() {
    printf 'Stopping local services; retaining the database volume and saved credentials.\n'
    if ! compose stop storage database; then
        printf 'Local service cleanup failed. Stop remaining containers with: %s compose --file compose.yaml --file development/compose.yaml stop storage database\n' "$container_engine" >&2
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if ! start_services database storage; then
    printf 'Local services are unavailable; retaining the database volume and saved credentials. Review the errors above and retry npm run dev after correcting the problem. The website will continue with unavailable features.\n' >&2
fi
start_website "$@"
