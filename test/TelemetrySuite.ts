import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import { metrics, SpanStatusCode, trace } from "@opentelemetry/api";
import { logs, SeverityNumber } from "@opentelemetry/api-logs";
import {
	initializeMetrics,
	observe,
	recordFailure,
} from "../src/app/telemetry/telemetry.ts";

function monitor(context: TestContext) {
	const span = {
		setAttribute: context.mock.fn(),
		setAttributes: context.mock.fn(),
		setStatus: context.mock.fn(),
		end: context.mock.fn(),
	};
	const counter = { add: context.mock.fn() };
	const histogram = { record: context.mock.fn() };
	const logger = { emit: context.mock.fn() };
	context.mock.method(metrics, "getMeter", () => ({
		createCounter: () => counter,
		createHistogram: () => histogram,
	}));
	context.mock.method(logs, "getLogger", () => logger);
	context.mock.method(trace, "getSpan", () => span);
	context.mock.method(trace, "getTracer", () => ({
		startActiveSpan: (
			_name: string,
			_options: unknown,
			action: (current: typeof span) => Promise<unknown>,
		) => action(span),
	}));
	initializeMetrics();
	return { span, counter, histogram, logger };
}

for (const { description, error, type, code } of [
	{
		description: "a missing error",
		error: undefined,
		type: "Error",
		code: undefined,
	},
	{
		description: "a non-error value",
		error: "private details",
		type: "Error",
		code: undefined,
	},
	{
		description: "a known error type",
		error: new TypeError("private details"),
		type: "TypeError",
		code: undefined,
	},
	{
		description: "a connection failure",
		error: Object.assign(new Error("private details"), {
			code: "ECONNREFUSED",
		}),
		type: "Error",
		code: "ECONNREFUSED",
	},
	{
		description: "a timeout in the cause",
		error: new Error("private details", { cause: { code: "ETIMEDOUT" } }),
		type: "Error",
		code: "ETIMEDOUT",
	},
	{
		description: "a private error name and code",
		error: Object.assign(new Error("private details"), {
			name: "private error name",
			code: "private error code",
		}),
		type: "Error",
		code: undefined,
	},
	{
		description: "a numeric error code",
		error: Object.assign(new Error("private details"), { code: 123 }),
		type: "Error",
		code: undefined,
	},
]) {
	test(`records safe failure diagnostics for ${description}`, (context) => {
		const { span, logger } = monitor(context);
		recordFailure("test.failure", error);
		const attributes = {
			"operation.name": "test.failure",
			"operation.outcome": "error",
			"error.type": type,
			...(code === undefined ? {} : { "error.code": code }),
		};
		assert.deepEqual(span.setStatus.mock.calls[0].arguments, [
			{ code: SpanStatusCode.ERROR },
		]);
		assert.deepEqual(span.setAttributes.mock.calls[0].arguments, [
			attributes,
		]);
		assert.deepEqual(logger.emit.mock.calls[0].arguments, [
			{
				severityNumber: SeverityNumber.ERROR,
				severityText: "ERROR",
				body: "Operation unavailable",
				attributes,
			},
		]);
	});
}

test("records a failure when there is no active span", (context) => {
	const { span, logger } = monitor(context);
	context.mock.method(trace, "getSpan", () => undefined);
	recordFailure("test.background");
	assert.equal(span.setStatus.mock.callCount(), 0);
	assert.equal(span.setAttributes.mock.callCount(), 0);
	assert.equal(logger.emit.mock.callCount(), 1);
});

for (const result of [
	{ value: 42 },
	new Response(null),
	new Response(null, { status: 404 }),
	new Response(null, { status: 503 }),
]) {
	test(`observes ${result instanceof Response ? result.status : "ordinary results"} and returns the original result`, async (context) => {
		const { span, counter, histogram, logger } = monitor(context);
		assert.equal(await observe("test.request", async () => result), result);
		const unavailable = result instanceof Response && result.status >= 500;
		const outcome = unavailable ? "unavailable" : "success";
		assert.deepEqual(counter.add.mock.calls[0].arguments, [
			1,
			{ "operation.name": "test.request", "operation.outcome": outcome },
		]);
		assert.equal(histogram.record.mock.callCount(), 1);
		const [seconds, attributes] = histogram.record.mock.calls[0].arguments;
		assert.ok(Number.isFinite(seconds) && seconds >= 0);
		assert.deepEqual(attributes, counter.add.mock.calls[0].arguments[1]);
		if (result instanceof Response) {
			assert.deepEqual(span.setAttribute.mock.calls[0].arguments, [
				"http.response.status_code",
				result.status,
			]);
		}
		assert.deepEqual(span.setAttribute.mock.calls.at(-1)!.arguments, [
			"operation.outcome",
			outcome,
		]);
		assert.equal(span.end.mock.callCount(), 1);
		assert.equal(logger.emit.mock.callCount(), Number(unavailable));
		assert.equal(span.setStatus.mock.callCount(), Number(unavailable));
	});
}

test("records thrown failures, completes their spans and metrics, and propagates the original error", async (context) => {
	const { span, counter, histogram, logger } = monitor(context);
	const failure = new TypeError("private details");
	await assert.rejects(
		observe("test.request", async () => {
			throw failure;
		}),
		(error) => error === failure,
	);
	assert.deepEqual(counter.add.mock.calls[0].arguments, [
		1,
		{ "operation.name": "test.request", "operation.outcome": "error" },
	]);
	assert.equal(histogram.record.mock.callCount(), 1);
	assert.equal(logger.emit.mock.callCount(), 1);
	assert.deepEqual(span.setAttribute.mock.calls.at(-1)!.arguments, [
		"operation.outcome",
		"error",
	]);
	assert.deepEqual(span.setStatus.mock.calls[0].arguments, [
		{ code: SpanStatusCode.ERROR },
	]);
	assert.equal(span.end.mock.callCount(), 1);
});
