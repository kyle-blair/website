import { TelemetryInitializationLog } from "../../../shared/telemetry-initialization-log.ts";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { initializeMetrics } from "../../../shared/telemetry.ts";
import {
	DefaultTraceProcessor,
	DefaultMetricReader,
	DefaultLogProcessor,
} from "../../../shared/telemetry-export.ts";

let telemetry: NodeSDK | undefined;
export function startTelemetry(serviceName = "website-storage") {
	if (telemetry) return telemetry;
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
			return undefined;

		telemetry = new NodeSDK({
			serviceName: process.env.OTEL_SERVICE_NAME || serviceName,
			autoDetectResources: false,
			textMapPropagator: new W3CTraceContextPropagator(),
			instrumentations: [
				new HttpInstrumentation(),
				new FastifyOtelInstrumentation({
					registerOnInitialization: true,
					instrumentHooks: false,
					instrumentHandler: false,
					recordExceptions: false,
				}),
				new PgInstrumentation(),
			],
			spanProcessors,
			metricReaders,
			logRecordProcessors,
		});
		telemetry.start();
		initializeMetrics();
		return telemetry;
	} catch (error) {
		telemetry = undefined;
		new TelemetryInitializationLog("telemetry", error).write();
		return undefined;
	}
}
