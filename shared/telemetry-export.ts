import {
	BatchSpanProcessor,
	type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-proto";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";

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

export class TelemetryExporter {
	public readonly configuration:
		| {
				spanProcessors: BatchSpanProcessor[];
				metricReaders: PeriodicExportingMetricReader[];
				logRecordProcessors: BatchLogRecordProcessor[];
		  }
		| undefined;

	public constructor() {
		const configured = Boolean(process.env.OTEL_EXPORTER_OTLP_ENDPOINT);
		if (
			!configured &&
			!["TRACES", "METRICS", "LOGS"].some(
				(signal) =>
					process.env[`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`],
			)
		)
			return;
		const interval = Number(
			process.env.OTEL_METRIC_EXPORT_INTERVAL || 30000,
		);
		this.configuration = {
			spanProcessors:
				configured || process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
					? [
							new BatchSpanProcessor({
								exporter: new PrivacyFilteringTraceExporter({
									timeoutMillis: 1000,
								}),
								maxQueueSize: 512,
								maxExportBatchSize: 128,
								exportTimeoutMillis: 1500,
							}),
						]
					: [],
			metricReaders:
				configured || process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
					? [
							new PeriodicExportingMetricReader({
								exporter: new OTLPMetricExporter({
									timeoutMillis: 1000,
								}),
								exportIntervalMillis: interval,
								exportTimeoutMillis: Math.min(interval, 1500),
							}),
						]
					: [],
			logRecordProcessors:
				configured || process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
					? [
							new BatchLogRecordProcessor({
								exporter: new OTLPLogExporter({
									timeoutMillis: 1000,
								}),
								maxQueueSize: 512,
								maxExportBatchSize: 128,
								exportTimeoutMillis: 1500,
							}),
						]
					: [],
		};
	}
}
