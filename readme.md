# https://zerofourtwo.com

This is the source for my personal/portfolio/professional website.
I don't yet have a significant enough reason to separate those roles into different sites.

## dependencies / prerequisites

- Node.js
- npm

A container runtime such as podman is required to run both integration tests and the
various backing services the website uses, although everything is intentionally designed
to "just work" as well as conditions allow.

## quick start

Run `npm clean-install` and `npm --prefix services/storage clean-install` from the
repository root to install dependencies.
Run `npm run dev` to start all backing services and the website with live reloading.
Run tests with `npm test`.

## observability

The website and storage service send traces, metrics, and logs directly to an
OpenTelemetry endpoint using the standard exporters. To use Grafana Cloud, copy the
connection settings from your stack's OpenTelemetry configuration page:

```sh
OTEL_EXPORTER_OTLP_ENDPOINT=https://<your-grafana-endpoint>/otlp
OTEL_EXPORTER_OTLP_HEADERS="Authorization=Basic <your-generated-credentials>"
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
```

Configure these server-side variables on both Render services, or put them in `.env`
for local development. Exports use `http/protobuf`. The exporters append the signal
paths to the base endpoint and handle HTTP authentication using
`OTEL_EXPORTER_OTLP_HEADERS`.

With no endpoint configured, telemetry initialization is skipped. Exporting uses bounded
background queues and timeouts; an unavailable or invalid endpoint does not prevent
application startup or requests.
Telemetry can be dropped when export fails or queues fill.

The application runs without a collector, telemetry disk, or local observability service.
An existing Render collector service and its disk must be retired separately from this
Blueprint change. Existing services also need their endpoint and authentication values
updated in Render; Blueprint entries marked `sync: false` do not replace saved settings.

Integration tests verify authenticated exports of all three signals and continued service
availability with missing configuration, connection failures, authentication rejection,
timeouts, and invalid configuration.

See [Grafana's direct export documentation](https://grafana.com/docs/grafana-cloud/send-data/otlp/send-data-otlp/).

## architecture

### microservices

The site is designed as a loose collection of microservices. For now, these services are
colocated in this repository. Services are designed to behave well even when dependent or
collaborating services are unavailable. For example, the website server still serves
pages even if the page views or feedback mechanisms apis don't work. The display of the
correpsonding components clearly indicates the feature isn't available, but it might be
even smarter to simply not render the component if the service it depends on is
unavailable.
