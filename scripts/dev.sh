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

if [[ -n "${DATABASE_URL:-}" ]]; then
    if ! npm run database:migrate; then
        printf 'Persistent counters are unavailable because the database schema could not be applied. Review the migration error, correct the database configuration, and retry npm run dev.\n' >&2
    fi
    start_website "$@"
    exit 0
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
    printf 'Missing OpenSSL for the local database credential. Install OpenSSL and make it available on PATH, then retry npm run dev.\n' >&2
    start_without_services "$@"
fi

compose() {
    "$container_engine" compose "$@"
}

export COMPOSE_FILE=compose.yaml:development/compose.yaml
printf 'Preparing the local database credential in .env with owner-only file permissions.\n'
umask 077
touch .env
chmod 600 .env
if [[ -n "${POSTGRES_PASSWORD:-}" ]] || grep -q '^POSTGRES_PASSWORD=' .env; then
    printf 'Reusing POSTGRES_PASSWORD from the environment or .env.\n'
else
    generated_secret=$(openssl rand -hex 32)
    printf '\nPOSTGRES_PASSWORD=%s\n' "$generated_secret" >> .env
    printf 'Generated and saved a random POSTGRES_PASSWORD for subsequent sessions.\n'
fi
POSTGRES_PASSWORD=$(node --env-file=.env --print 'process.env.POSTGRES_PASSWORD')
export POSTGRES_PASSWORD
database_port=${DATABASE_PORT:-54320}
export DATABASE_URL
DATABASE_URL=$(node --print 'const url = new URL("postgresql://storage_service@127.0.0.1/website"); url.port = process.env.DATABASE_PORT || "54320"; url.password = process.env.POSTGRES_PASSWORD; url.toString()')

report_database_failure() {
    printf 'Persistent counters are unavailable because the local database could not start. Review the error or container status above.\n' >&2
    printf 'Inspect container status: %s compose --file compose.yaml --file development/compose.yaml ps\n' "$container_engine" >&2
    printf 'Inspect database logs: %s compose --file compose.yaml --file development/compose.yaml logs --tail 50 database\n' "$container_engine" >&2
    printf 'Correct the reported problem, then stop this development session and retry npm run dev.\n' >&2
}

service_container() {
    local identifiers identifier container_service
    identifiers=$(compose ps --quiet) || return 1
    for identifier in $identifiers; do
        container_service=$("$container_engine" inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$identifier") || return 1
        if [[ "$container_service" == database ]]; then
            printf '%s\n' "$identifier"
            return 0
        fi
    done
    return 1
}

wait_for_database() {
    local identifier state container_status health_status attempt
    if ! identifier=$(service_container) || [[ -z "$identifier" ]]; then
        printf 'No container could be found for database.\n' >&2
        return 1
    fi
    for ((attempt=0; attempt<60; attempt++)); do
        if ! state=$("$container_engine" inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$identifier"); then
            printf 'Could not inspect the database container.\n' >&2
            return 1
        fi
        read -r container_status health_status <<< "$state"
        if [[ "$container_status" == running && "$health_status" == healthy ]]; then
            printf 'Local database is running and healthy.\n'
            return 0
        fi
        if [[ "$container_status" == running && -z "$health_status" ]]; then
            printf 'Database has no container health check; refusing to report it as ready.\n' >&2
            return 1
        fi
        if [[ "$container_status" == restarting || "$container_status" == exited || "$container_status" == dead || "$health_status" == unhealthy ]]; then
            printf 'database: %s\n' "$state" >&2
            return 1
        fi
        sleep 1
    done
    printf 'Database did not become ready after 60 checks, one second apart. Last container status: %s\n' "$state" >&2
    return 1
}

cleanup() {
    printf 'Stopping the local database; retaining its volume and saved credential.\n'
    if ! compose stop database; then
        printf 'Local database cleanup failed. Stop it with: %s compose --file compose.yaml --file development/compose.yaml stop database\n' "$container_engine" >&2
    fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

if ! compose up --detach --build --force-recreate --remove-orphans database || ! wait_for_database; then
    report_database_failure
elif ! npm run database:migrate; then
    printf 'Persistent counters are unavailable because the database schema could not be applied. Review the migration error, correct the database configuration, and retry npm run dev.\n' >&2
fi

start_website "$@"
