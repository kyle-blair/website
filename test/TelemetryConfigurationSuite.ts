import assert from "node:assert/strict";
import { test } from "node:test";
import {
	DefaultTraceProcessor,
	DefaultMetricReader,
	DefaultLogProcessor,
	TelemetryEndpointNotConfiguredError,
} from "../shared/telemetry-export.ts";

for (const setting of [
	undefined,
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
	"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
	"OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
]) {
	test(`constructs only configured telemetry signals for ${setting ?? "no endpoint"}`, async (context) => {
		const environment = { ...process.env };
		context.after(() => {
			process.env = environment;
		});
		for (const key of Object.keys(process.env))
			if (key.startsWith("OTEL_")) delete process.env[key];
		if (setting) process.env[setting] = "http://127.0.0.1:1";

		for (const [signal, Component] of [
			["TRACES", DefaultTraceProcessor],
			["METRICS", DefaultMetricReader],
			["LOGS", DefaultLogProcessor],
		] as const) {
			if (
				setting === "OTEL_EXPORTER_OTLP_ENDPOINT" ||
				setting === `OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`
			) {
				const component = new Component();
				context.after(() => component.shutdown());
			} else {
				assert.throws(
					() => new Component(),
					(error) => {
						assert.ok(
							error instanceof
								TelemetryEndpointNotConfiguredError,
						);
						assert.equal(
							error.message,
							`${signal === "TRACES" ? "Trace" : signal === "METRICS" ? "Metric" : "Log"} exporting requires an endpoint. Set OTEL_EXPORTER_OTLP_ENDPOINT or OTEL_EXPORTER_OTLP_${signal}_ENDPOINT.`,
						);
						return true;
					},
				);
			}
		}
	});
}
