FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install --yes --no-install-recommends aardvark-dns ca-certificates docker-compose fuse-overlayfs iptables libcap2-bin nftables openssl podman slirp4netns uidmap \
    && chmod 0755 /usr/bin/newuidmap /usr/bin/newgidmap \
    && setcap cap_setuid=ep /usr/bin/newuidmap \
    && setcap cap_setgid=ep /usr/bin/newgidmap \
    && rm -rf /var/lib/apt/lists/*
RUN printf 'unqualified-search-registries = ["docker.io"]\n' > /etc/containers/registries.conf
RUN useradd --create-home --uid 1000 runner \
    && printf 'runner:1:999\nrunner:1001:64536\n' > /etc/subuid \
    && printf 'runner:1:999\nrunner:1001:64536\n' > /etc/subgid \
    && mkdir -p /home/runner/.config/containers /home/runner/.local/share/containers /home/runner/.run \
    && chown -R runner:runner /home/runner \
    && chmod 700 /home/runner/.run
COPY containers/integration/containers.conf /home/runner/.config/containers/containers.conf
COPY containers/integration/storage.conf /home/runner/.config/containers/storage.conf
WORKDIR /workspace
COPY --chown=runner:runner .dockerignore compose.yaml containerfile package.json package-lock.json next.config.ts tsconfig.json ./
COPY --chown=runner:runner src ./src
COPY --chown=runner:runner shared ./shared
COPY --chown=runner:runner database ./database
COPY --chown=runner:runner test/integration ./test/integration
COPY --chown=runner:runner containers/integration ./containers/integration
COPY --chown=runner:runner scripts/integration-runner.sh ./scripts/integration-runner.sh
COPY --chown=runner:runner scripts/health-check.mjs ./scripts/health-check.mjs
COPY --chown=runner:runner scripts/migrate-database.mjs ./scripts/migrate-database.mjs
ENV XDG_RUNTIME_DIR=/home/runner/.run \
    DOCKER_HOST=unix:///home/runner/.run/podman.sock \
    DOCKER_BUILDKIT=0 \
    BUILDAH_ISOLATION=rootless \
    COMPOSE_FILE=compose.yaml:containers/integration/compose.yaml \
    COMPOSE_PROJECT_NAME=website-integration
VOLUME ["/home/runner/.local/share/containers"]
USER runner
ENTRYPOINT ["bash", "scripts/integration-runner.sh"]
