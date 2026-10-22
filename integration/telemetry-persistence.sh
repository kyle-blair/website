#!/usr/bin/env bash
set -euo pipefail

storage_identifier=$1
collector_identifier=$2
snapshot=$(mktemp -d)
trap 'rm -rf "$snapshot"' EXIT

verify_saved_telemetry() {
    local marker=$1 signal attempt saved
    for attempt in {1..20}; do
        saved=true
        for signal in traces metrics logs; do
            if ! podman cp "$collector_identifier:/var/data/$signal.json" "$snapshot/$signal.json" >/dev/null 2>&1 || ! grep --fixed-strings --quiet "$marker" "$snapshot/$signal.json"; then
                saved=false
            fi
        done
        if [[ "$saved" == true ]]; then return 0; fi
        sleep 1
    done
    printf 'Collector did not persist %s in all three telemetry files.\n' "$marker" >&2
    podman logs "$collector_identifier"
    exit 1
}

podman exec "$collector_identifier" sh -c 'grep -Eq "^Uid:[[:space:]]+1000[[:space:]]" /proc/1/status'
podman exec --interactive "$storage_identifier" node --input-type=module - before-restart < integration/telemetry-persistence.mjs
verify_saved_telemetry persistence.before-restart

docker-compose stop telemetry
docker-compose rm --force telemetry
docker-compose create telemetry
collector_identifier=$(docker-compose ps --all --quiet telemetry)
podman start "$collector_identifier"
ready=false
for attempt in {1..30}; do
    if podman exec "$storage_identifier" node --input-type=module --eval \
        'const response = await fetch("http://telemetry:13133", {signal: AbortSignal.timeout(2000)}); process.exit(response.ok ? 0 : 1)'; then
        ready=true
        break
    fi
    sleep 1
done
if [[ "$ready" != true ]]; then
    podman logs "$collector_identifier"
    exit 1
fi

podman exec --interactive "$storage_identifier" node --input-type=module - after-restart < integration/telemetry-persistence.mjs
verify_saved_telemetry persistence.after-restart
verify_saved_telemetry persistence.before-restart
printf 'Traces, metrics, and logs survive collector replacement and accept new records.\n'
