import assert from "node:assert/strict";
import { test } from "node:test";
import { TelemetryExporter } from "../shared/telemetry-export.ts";

for (const setting of [
	undefined,
	"OTEL_EXPORTER_OTLP_ENDPOINT",
	"OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
	"OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
	"OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
]) {
	test(`initializes only configured telemetry exporters with ${setting ?? "no endpoint"}`, async (context) => {
		const previous = { ...process.env };
		context.after(() => {
			process.env = previous;
		});
		for (const key of Object.keys(process.env))
			if (key.startsWith("OTEL_")) delete process.env[key];
		if (setting) process.env[setting] = "http://127.0.0.1:1";
		const warning = context.mock.method(console, "warn", () => {});
		const configuration = new TelemetryExporter().configuration;
		if (configuration) {
			context.after(async () => {
				await Promise.all(
					[
						...configuration.spanProcessors,
						...configuration.metricReaders,
						...configuration.logRecordProcessors,
					].map((processor) => processor.shutdown()),
				);
			});
		}
		if (!setting) {
			assert.equal(configuration, undefined);
		} else {
			assert.ok(configuration);
			const allSignals = setting === "OTEL_EXPORTER_OTLP_ENDPOINT";
			assert.equal(
				configuration.spanProcessors.length,
				Number(
					allSignals ||
						setting === "OTEL_EXPORTER_OTLP_TRACES_ENDPOINT",
				),
			);
			assert.equal(
				configuration.metricReaders.length,
				Number(
					allSignals ||
						setting === "OTEL_EXPORTER_OTLP_METRICS_ENDPOINT",
				),
			);
			assert.equal(
				configuration.logRecordProcessors.length,
				Number(
					allSignals ||
						setting === "OTEL_EXPORTER_OTLP_LOGS_ENDPOINT",
				),
			);
		}
		assert.equal(warning.mock.callCount(), 0);
	});
}
