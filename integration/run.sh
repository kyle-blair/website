#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

STORAGE_SERVICE_TOKEN=$(openssl rand -hex 32)
POSTGRES_PASSWORD=$(openssl rand -hex 32)
export STORAGE_SERVICE_TOKEN POSTGRES_PASSWORD

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
    local service=$1
    local identifier
    identifier=$(docker-compose ps --all --quiet "$service")
    for attempt in {1..60}; do
        if podman healthcheck run "$identifier"; then
            return 0
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
curl --fail --silent --show-error --retry 30 --retry-all-errors --retry-delay 1 \
    --unix-socket "$XDG_RUNTIME_DIR/podman.sock" http://localhost/_ping >/dev/null

docker-compose config --quiet
docker-compose down --volumes --remove-orphans
docker-compose create --build

for service in website storage; do
    identifier=$(docker-compose ps --all --quiet "$service")
    podman start "$identifier"
    wait_for_service "$service"
done

printf 'Verifying application behavior without PostgreSQL.\n'
identifier=$(docker-compose ps --all --quiet dependency-tests)
podman start --attach "$identifier"

identifier=$(docker-compose ps --all --quiet database)
podman start "$identifier"
wait_for_service database

storage_identifier=$(docker-compose ps --all --quiet storage)
ready=false
for attempt in {1..60}; do
    if podman exec "$storage_identifier" node --input-type=module --eval \
        'const response = await fetch("http://127.0.0.1:10000/health/ready"); process.exit(response.ok ? 0 : 1)'; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    printf 'Storage did not recover after PostgreSQL became available.\n' >&2
    podman logs "$storage_identifier"
    exit 1
fi

identifier=$(docker-compose ps --all --quiet telemetry)
podman start "$identifier"
ready=false
for attempt in {1..30}; do
    if podman exec "$storage_identifier" node --input-type=module --eval \
        'const response = await fetch("http://telemetry:13133"); process.exit(response.ok ? 0 : 1)'; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    podman logs "$identifier"
    exit 1
fi

for suite in storage-tests website-tests; do
    printf 'Running %s inside the disposable integration runner.\n' "$suite"
    identifier=$(docker-compose ps --all --quiet "$suite")
    podman start --attach "$identifier"
done

printf 'Investigating telemetry export during standalone server shutdown.\n'
identifier=$(docker-compose ps --all --quiet website)
podman exec --interactive "$identifier" node --input-type=module < integration/shutdown-probe.mjs

identifier=$(docker-compose ps --all --quiet telemetry)
telemetry_output=$(podman logs "$identifier" 2>&1)
for library in '@opentelemetry/instrumentation-http' '@fastify/otel' '@opentelemetry/instrumentation-pg'; do
    if [[ "$telemetry_output" != *"$library"* ]]; then
        printf 'Collector did not report automatic instrumentation from %s.\n' "$library" >&2
        exit 1
    fi
done

printf 'Verifying telemetry survives collector replacement.\n'
bash integration/telemetry-persistence.sh "$storage_identifier" "$identifier"

printf 'Verifying published pages without storage or telemetry.\n'
for service in telemetry storage; do
    identifier=$(docker-compose ps --all --quiet "$service")
    podman stop "$identifier"
done
identifier=$(docker-compose ps --all --quiet unavailable-tests)
podman start --attach "$identifier"

printf 'Verifying website shutdown while telemetry is unavailable.\n'
identifier=$(docker-compose ps --all --quiet website)
podman stop --time 28 "$identifier"
exit_status=$(podman inspect --format '{{.State.ExitCode}}' "$identifier")
if [[ "$exit_status" != 143 ]]; then
    printf 'Website shutdown failed with exit status %s.\n' "$exit_status" >&2
    podman logs "$identifier"
    exit 1
fi
