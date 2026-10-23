import assert from "node:assert/strict";
import { test } from "node:test";
import { metrics } from "@opentelemetry/api";
import { initializeMetrics, recordOperation } from "../shared/telemetry.ts";
import {
	AggregationTemporality,
	DataPointType,
	InMemoryMetricExporter,
	MeterProvider,
	PeriodicExportingMetricReader,
} from "@opentelemetry/sdk-metrics";

test("records operations when a request module has not initialized metrics at startup", (context) => {
	const counts: unknown[] = [];
	const durations: unknown[] = [];
	context.mock.method(metrics, "getMeter", () => ({
		createCounter: () => ({
			add: (...values: unknown[]) => counts.push(values),
		}),
		createHistogram: () => ({
			record: (...values: unknown[]) => durations.push(values),
		}),
	}));
	recordOperation("test.request", 0.1, "success", 200);
	assert.deepEqual(counts, [
		[
			1,
			{
				"operation.name": "test.request",
				"operation.outcome": "success",
				"http.response.status_code": 200,
			},
		],
	]);
	assert.deepEqual(durations, [
		[
			0.1,
			{
				"operation.name": "test.request",
				"operation.outcome": "success",
				"http.response.status_code": 200,
			},
		],
	]);
});

test("preserves useful duration histogram buckets for fast and slow operations", async (context) => {
	const exporter = new InMemoryMetricExporter(
		AggregationTemporality.CUMULATIVE,
	);
	const reader = new PeriodicExportingMetricReader({ exporter });
	const provider = new MeterProvider({ readers: [reader] });
	context.after(() => provider.shutdown());
	context.mock.method(metrics, "getMeter", provider.getMeter.bind(provider));
	initializeMetrics();
	recordOperation("test.fast", 0.01, "success");
	recordOperation("test.slow", 0.1, "success");
	await provider.forceFlush();
	const duration = exporter
		.getMetrics()
		.flatMap((resource) =>
			resource.scopeMetrics.flatMap((scope) => scope.metrics),
		)
		.find(
			(metric) => metric.descriptor.name === "website.operation.duration",
		);
	assert.ok(duration);
	assert.equal(duration.dataPointType, DataPointType.HISTOGRAM);
	const buckets = ["test.fast", "test.slow"].map((operation) => {
		const point = duration.dataPoints.find(
			(point) => point.attributes["operation.name"] === operation,
		);
		assert.ok(point);
		return point.value.buckets.counts.findIndex((count) => count > 0);
	});
	assert.ok(buckets[0] >= 0);
	assert.ok(buckets[1] > buckets[0]);
});
