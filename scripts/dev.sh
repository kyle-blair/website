#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

for dependency in node npm openssl; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
        printf 'Missing required command: %s. Make it available on PATH and retry.\n' "$dependency" >&2
        exit 127
    fi
done

if command -v docker >/dev/null 2>&1; then
    container_engine=docker
elif command -v podman >/dev/null 2>&1; then
    container_engine=podman
else
    printf 'Missing container engine. Docker or Podman with Compose support must be available on PATH.\n' >&2
    exit 127
fi

if ! "$container_engine" compose version >/dev/null; then
    printf '\n%s compose could not run. Check that its Compose provider is installed and available to this command. See the provider error above.\n' "$container_engine" >&2
    exit 1
fi
if ! "$container_engine" info >/dev/null; then
    printf '\nCannot connect to %s. Start the container engine and check your connection and access permissions. See the engine error above.\n' "$container_engine" >&2
    exit 1
fi
if [[ ! -d node_modules ]]; then
    printf 'Project dependencies are missing. Run npm clean-install from the repository root.\n' >&2
    exit 1
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

cleanup() {
    printf 'Stopping local services; retaining the database volume and saved credentials.\n'
    compose stop storage database
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf 'Building storage and PostgreSQL containers and waiting for readiness.\n'
compose up --detach --build --wait storage
printf 'Starting the website with live reloading. Credential values are not printed.\n'
npm exec -- next dev "$@"
