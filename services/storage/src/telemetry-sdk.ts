import { NodeSDK } from "@opentelemetry/sdk-node";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { PgInstrumentation } from "@opentelemetry/instrumentation-pg";
import { FastifyOtelInstrumentation } from "@fastify/otel";
import { initializeMetrics } from "../../../shared/telemetry.ts";
import { telemetryOptions } from "../../../shared/telemetry-export.ts";

let telemetry: NodeSDK | undefined;
export function startTelemetry(serviceName = "website-storage") {
	if (process.env.OTEL_SDK_DISABLED === "true") return undefined;
	if (telemetry) return telemetry;
	try {
		telemetry = new NodeSDK({
			...telemetryOptions(),
			resource: resourceFromAttributes({
				"service.name": process.env.OTEL_SERVICE_NAME || serviceName,
			}),
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
				new PgInstrumentation({ enhancedDatabaseReporting: false }),
			],
		});
		telemetry.start();
		initializeMetrics();
		return telemetry;
	} catch {
		telemetry = undefined;
		process.stderr.write("Telemetry configuration unavailable\n");
		return undefined;
	}
}
