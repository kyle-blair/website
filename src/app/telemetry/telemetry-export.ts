import {
	BatchSpanProcessor,
	type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";

export class TelemetryEndpointNotConfiguredError extends Error {}

export class PrivacyFilteringTraceExporter extends OTLPTraceExporter {
	public override export(
		spans: ReadableSpan[],
		callback: Parameters<OTLPTraceExporter["export"]>[1],
	) {
		super.export(
			spans.map((span) => ({
				...span,
				spanContext: () => span.spanContext(),
				duration: span.duration,
				ended: span.ended,
				name: String(
					span.attributes["operation.name"] ??
						span.attributes["next.span_type"] ??
						span.instrumentationScope.name,
				),
				attributes: {
					...Object.fromEntries(
						Object.entries(span.attributes).filter(([key]) =>
							[
								"operation.name",
								"operation.outcome",
								"http.response.status_code",
								"next.span_type",
								"error.type",
								"error.code",
							].includes(key),
						),
					),
					...(span.attributes["http.status_code"] === undefined
						? {}
						: {
								"http.response.status_code":
									span.attributes["http.status_code"],
							}),
				},
				events: [],
				links: [],
				status: { code: span.status.code },
			})),
			callback,
		);
	}
}

export class DefaultTraceProcessor extends BatchSpanProcessor {
	constructor() {
		if (
			!process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
			!process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
		)
			throw new TelemetryEndpointNotConfiguredError(
				"Trace exporting requires an endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_TRACES_ENDPOINT.",
			);
		super({
			exporter: new PrivacyFilteringTraceExporter({
				timeoutMillis: 1000,
			}),
		});
	}
}

export class DefaultMetricReader extends PeriodicExportingMetricReader {
	constructor() {
		if (
			!process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
			!process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
		)
			throw new TelemetryEndpointNotConfiguredError(
				"Metric exporting requires an endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_METRICS_ENDPOINT.",
			);
		super({
			exporter: new OTLPMetricExporter({ timeoutMillis: 1000 }),
			exportIntervalMillis: Number(
				process.env.OTEL_METRIC_EXPORT_INTERVAL || 60000,
			),
		});
	}
}

export class DefaultLogProcessor extends BatchLogRecordProcessor {
	constructor() {
		if (
			!process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
			!process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
		)
			throw new TelemetryEndpointNotConfiguredError(
				"Log exporting requires an endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_LOGS_ENDPOINT.",
			);
		super({
			exporter: new OTLPLogExporter({ timeoutMillis: 1000 }),
		});
	}
}
