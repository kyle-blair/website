#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

POSTGRES_PASSWORD=$(openssl rand -hex 32)
export POSTGRES_PASSWORD

service_process=
cleanup() {
    exit_status=$?
    trap - EXIT
    if ! docker-compose down --volumes --remove-orphans; then
        if [[ "$exit_status" -eq 0 ]]; then exit_status=1; fi
    fi
    if [[ -n "$service_process" ]]; then
        kill "$service_process" 2>/dev/null || true
        wait "$service_process" 2>/dev/null || true
    fi
    exit "$exit_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

wait_for_service() {
    local service=$1 identifier state container_status health_status
    identifier=$(docker-compose ps --all --quiet "$service")
    for attempt in {1..60}; do
        podman healthcheck run "$identifier" >/dev/null 2>&1 || true
        state=$(podman inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$identifier")
        read -r container_status health_status <<< "$state"
        if [[ "$container_status" == running && "$health_status" == healthy ]]; then
            return 0
        fi
        if [[ "$container_status" == exited || "$container_status" == dead || "$container_status" == restarting ]]; then
            break
        fi
        sleep 1
    done
    printf 'Integration service %s did not become healthy.\n' "$service" >&2
    podman inspect --format '{{.Name}} {{json .State}}' "$identifier"
    podman logs "$identifier"
    return 1
}

podman system service --time 0 "$DOCKER_HOST" &
service_process=$!
for attempt in {1..30}; do
    if docker-compose ps --quiet >/dev/null 2>&1; then break; fi
    if [[ "$attempt" -eq 30 ]]; then
        printf 'Podman service did not become available.\n' >&2
        exit 1
    fi
    sleep 1
done

docker-compose config --quiet
docker-compose down --volumes --remove-orphans
docker-compose create --build website database
docker-compose build tests

website_identifier=$(docker-compose ps --all --quiet website)
podman start "$website_identifier"
wait_for_service website

printf 'Verifying website behavior without PostgreSQL.\n'
docker-compose run --rm --no-deps tests node --test test/integration/DependencySuite.ts

database_identifier=$(docker-compose ps --all --quiet database)
podman start "$database_identifier"
wait_for_service database
podman exec "$website_identifier" node scripts/migrate-database.mjs

printf 'Running WebsiteSuite inside the disposable integration runner.\n'
docker-compose run --rm --no-deps tests node --test test/integration/WebsiteSuite.ts

printf 'Verifying direct telemetry export and failure isolation for the website.\n'
podman cp test/integration/TelemetrySuite.ts "$website_identifier:/tmp/TelemetrySuite.ts"
podman exec --env TELEMETRY_TEST_SERVICE=website "$website_identifier" node --test /tmp/TelemetrySuite.ts

printf 'Verifying published pages without PostgreSQL.\n'
podman stop "$database_identifier"
docker-compose run --rm --no-deps tests node --test test/integration/UnavailableServicesSuite.ts

printf 'Verifying website shutdown with an unavailable telemetry endpoint.\n'
podman stop --time 28 "$website_identifier"
exit_status=$(podman inspect --format '{{.State.ExitCode}}' "$website_identifier")
if [[ "$exit_status" != 143 ]]; then
    printf 'Website shutdown failed with exit status %s.\n' "$exit_status" >&2
    podman logs "$website_identifier"
    exit 1
fi
