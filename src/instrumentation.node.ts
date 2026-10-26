import { TelemetryInitializationLog } from "../shared/telemetry-initialization-log.ts";
import { registerOTel } from "@vercel/otel";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import {
	DefaultTraceProcessor,
	DefaultMetricReader,
	DefaultLogProcessor,
} from "../shared/telemetry-export.ts";
import { initializeMetrics } from "../shared/telemetry.ts";

export function registerTelemetry() {
	try {
		const spanProcessors: DefaultTraceProcessor[] = [];
		const metricReaders: DefaultMetricReader[] = [];
		const logRecordProcessors: DefaultLogProcessor[] = [];
		try {
			spanProcessors.push(new DefaultTraceProcessor());
		} catch (error) {
			new TelemetryInitializationLog("traces", error).write();
		}
		try {
			metricReaders.push(new DefaultMetricReader());
		} catch (error) {
			new TelemetryInitializationLog("metrics", error).write();
		}
		try {
			logRecordProcessors.push(new DefaultLogProcessor());
		} catch (error) {
			new TelemetryInitializationLog("logs", error).write();
		}
		if (
			spanProcessors.length === 0 &&
			metricReaders.length === 0 &&
			logRecordProcessors.length === 0
		)
			return;

		registerOTel({
			serviceName: "website",
			autoDetectResources: false,
			propagators: ["tracecontext"],
			instrumentations: [
				new UndiciInstrumentation(),
				new PgInstrumentation(),
			],
			spanProcessors,
			metricReaders,
			logRecordProcessors,
		});
		initializeMetrics();
	} catch (error) {
		new TelemetryInitializationLog("telemetry", error).write();
	}
}
