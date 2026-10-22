FROM debian:trixie-slim
RUN apt-get update \
    && apt-get install --yes --no-install-recommends aardvark-dns ca-certificates curl docker-compose fuse-overlayfs iptables openssl podman slirp4netns uidmap \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
RUN apt-get update \
    && apt-get install --yes --no-install-recommends libcap2-bin nftables \
    && chmod 0755 /usr/bin/newuidmap /usr/bin/newgidmap \
    && setcap cap_setuid=ep /usr/bin/newuidmap \
    && setcap cap_setgid=ep /usr/bin/newgidmap \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*
RUN printf 'unqualified-search-registries = ["docker.io"]\n' > /etc/containers/registries.conf
RUN useradd --create-home --uid 1000 runner \
    && printf 'runner:10000:50000\n' > /etc/subuid \
    && printf 'runner:10000:50000\n' > /etc/subgid \
    && mkdir -p /home/runner/.config/containers /home/runner/.local/share/containers /home/runner/.run \
    && chown -R runner:runner /home/runner \
    && chmod 700 /home/runner/.run
COPY integration/runner-containers.conf /home/runner/.config/containers/containers.conf
COPY integration/runner-storage.conf /home/runner/.config/containers/storage.conf
WORKDIR /workspace
COPY --chown=runner:runner compose.yaml containerfile package.json package-lock.json next.config.ts tsconfig.json ./
COPY --chown=runner:runner src ./src
COPY --chown=runner:runner shared ./shared
COPY --chown=runner:runner services/storage/containerfile services/storage/package.json services/storage/package-lock.json ./services/storage/
COPY --chown=runner:runner services/storage/src ./services/storage/src
COPY --chown=runner:runner services/telemetry ./services/telemetry
COPY --chown=runner:runner integration ./integration
ENV XDG_RUNTIME_DIR=/home/runner/.run \
    DOCKER_HOST=unix:///home/runner/.run/podman.sock \
    DOCKER_BUILDKIT=0 \
    BUILDAH_ISOLATION=rootless \
    COMPOSE_FILE=compose.yaml:integration/compose.yaml \
    COMPOSE_PROJECT_NAME=website-integration
VOLUME ["/home/runner/.local/share/containers"]
USER runner
ENTRYPOINT ["bash", "integration/run.sh"]
