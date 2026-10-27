# https://zerofourtwo.com

This is the source for my personal/portfolio/professional website.
I don't yet have a significant enough reason to separate those roles into different sites.

## dependencies / prerequisites

- Node.js
- npm

A container runtime such as Podman is required to run integration tests and the local
PostgreSQL database, although the website remains available when persistence is not.

## quick start

Run `npm clean-install` from the repository root to install dependencies.
Run `npm run dev` to start PostgreSQL, apply the database schema, and start the website
with live reloading.
Run tests with `npm test`.

## observability

Services are fully instrumented and can send traces, metrics, and logs directly to an
OpenTelemetry endpoint using standard environment variables. Telemetry is designed to be
optional. You can pretend it doesn't exist with no ill effect. In order to use it,
configure the following exporter variables. I hope to streamline this in the future so
that it's even less prescriptive than this.

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-open-telemetry-compatible-endpoint>/otlp
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <your-generated-credentials>"
```
