#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

cache_volume=
runner_name="website-integration-${RANDOM}-$$"
case "${INTEGRATION_BUILD_CACHE:-0}" in
    0|false) ;;
    1|true)
        cache_volume=website-integration-build-cache-v2
        runner_name=website-integration-cache-runner
        ;;
    *)
        printf 'INTEGRATION_BUILD_CACHE must be 0, 1, false, or true.\n' >&2
        exit 2
        ;;
esac

if ! command -v podman >/dev/null 2>&1; then
    printf 'Integration tests require Podman. Install it and start its machine when required by your operating system.\n' >&2
    exit 127
fi

runner_image=localhost/website-integration-runner
printf 'Integration runner: %s\n' "$runner_name"
if [[ -n "$cache_volume" ]]; then
    printf 'Preserving inner images and build cache in volume %s.\n' "$cache_volume"
fi
podman build --file containers/integration/runner.containerfile --tag "$runner_image" .

runner_identifier=
cleanup() {
    exit_status=$?
    trap - EXIT
    if [[ -n "$runner_identifier" ]] && ! podman rm --force --volumes --ignore "$runner_identifier"; then
        printf 'Could not remove integration runner %s.\n' "$runner_name" >&2
        printf 'Retry cleanup with: podman rm --force --volumes --ignore %s\n' "$runner_identifier" >&2
        if [[ "$exit_status" -eq 0 ]]; then exit_status=1; fi
    fi
    exit "$exit_status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

runner_arguments=(
    --name "$runner_name" --rm --init --user runner
    --device /dev/fuse
    --device /dev/net/tun
    --security-opt label=disable
    --security-opt unmask=ALL
)
if [[ -n "$cache_volume" ]]; then
    runner_arguments+=(--volume "$cache_volume:/home/runner/.local/share/containers")
fi
runner_identifier=$(podman create "${runner_arguments[@]}" "$runner_image")
podman start --attach "$runner_identifier"
