import assert from "node:assert/strict";
import { test } from "node:test";
import { SpanStatusCode } from "@opentelemetry/api";
import {
	TracerProvider,
	SimpleSpanProcessor,
	type ReadableSpan,
} from "@opentelemetry/sdk-trace";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { PrivacyFilteringTraceExporter } from "../shared/telemetry-export.ts";

test("exports useful trace diagnostics while removing private attributes, events, links, and messages", async (context) => {
	const spans: ReadableSpan[] = [];
	context.mock.method(
		OTLPTraceExporter.prototype,
		"export",
		(
			batch: ReadableSpan[],
			callback: Parameters<OTLPTraceExporter["export"]>[1],
		) => {
			spans.push(...batch);
			callback({ code: 0 });
		},
	);
	const exporter = new PrivacyFilteringTraceExporter();
	const provider = new TracerProvider({
		spanProcessors: [new SimpleSpanProcessor({ exporter })],
	});
	context.after(() => provider.shutdown());
	const tracer = provider.getTracer("test.instrumentation");
	for (const status of [200, 400, 401, 404, 503]) {
		const span = tracer.startSpan("private request path", {
			attributes: {
				"operation.name": "test.request",
				"operation.outcome": "unavailable",
				"http.status_code": status,
				"url.full": "https://private.invalid/visitor",
				"error.type": "TypeError",
				"error.code": "ECONNREFUSED",
			},
		});
		span.addEvent("private event", { credentials: "secret" });
		span.addLink({
			context: span.spanContext(),
			attributes: { visitor: "secret" },
		});
		span.setStatus({
			code: SpanStatusCode.ERROR,
			message: "private error",
		});
		span.end();
	}
	tracer.startSpan("private fallback").end();
	tracer
		.startSpan("private next path", {
			attributes: { "next.span_type": "render" },
		})
		.end();
	await provider.forceFlush();
	assert.equal(spans.length, 7);
	for (const [index, status] of [200, 400, 401, 404, 503].entries()) {
		const span = spans[index];
		assert.equal(span.name, "test.request");
		assert.deepEqual(span.attributes, {
			"operation.name": "test.request",
			"operation.outcome": "unavailable",
			"http.response.status_code": status,
			"error.type": "TypeError",
			"error.code": "ECONNREFUSED",
		});
		assert.deepEqual(span.events, []);
		assert.deepEqual(span.links, []);
		assert.deepEqual(span.status, { code: SpanStatusCode.ERROR });
		assert.match(span.spanContext().traceId, /^[a-f0-9]{32}$/);
		assert.ok(span.ended);
		assert.ok(span.duration);
	}
	assert.equal(spans[5].name, "test.instrumentation");
	assert.equal(spans[6].name, "render");
});
