import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";

const registrations: unknown[] = [];
const failures: unknown[] = [];
Object.assign(globalThis, { registrations, failures });
registerHooks({
	load(url, context, nextLoad) {
		if (url.includes("/@vercel/otel/"))
			return {
				format: "module",
				shortCircuit: true,
				source: "export function registerOTel(config) {if(globalThis.registrationFailure) throw globalThis.registrationFailure; globalThis.registrations.push(config);}",
			};
		if (url.endsWith("/shared/telemetry.ts"))
			return {
				format: "module",
				shortCircuit: true,
				source: "export function initializeMetrics() {} export function recordFailure(operation, error) {globalThis.failures.push({operation, error});}",
			};
		return nextLoad(url, context);
	},
});
const { register, onRequestError } = await import("../src/instrumentation.ts");

test("uses the documented Next.js integration in the Node.js runtime", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
	const previous = process.env.NEXT_RUNTIME;
	context.after(() => {
		if (previous === undefined) delete process.env.NEXT_RUNTIME;
		else process.env.NEXT_RUNTIME = previous;
	});
	process.env.NEXT_RUNTIME = "edge";
	await register();
	await onRequestError();
	assert.equal(registrations.length, 0);
	process.env.NEXT_RUNTIME = "nodejs";
	await register();
	assert.equal(registrations.length, 1);
	assert.equal(
		(registrations[0] as { serviceName: string }).serviceName,
		"website",
	);
	const error = new TypeError("render failed");
	await onRequestError(error);
	assert.deepEqual(failures, [{ operation: "website.render", error }]);
});

test("logs telemetry initialization failures with their original error details", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
	const cause = Object.assign(
		new Error("The exporter rejected its configuration."),
		{ code: "ECONNREFUSED" },
	);
	const failure = new Error("Telemetry registration failed.", { cause });
	Object.assign(globalThis, { registrationFailure: failure });
	context.after(() =>
		Object.assign(globalThis, { registrationFailure: undefined }),
	);
	const logged = context.mock.method(console, "log", () => {});
	const { registerTelemetry } =
		await import("../src/instrumentation.node.ts");
	assert.doesNotThrow(() => registerTelemetry());
	assert.equal(logged.mock.callCount(), 1);
	const record = JSON.parse(logged.mock.calls[0].arguments[0]);
	assert.equal(record.severityText, "ERROR");
	assert.equal(record.severityNumber, 17);
	assert.equal(record.component, "telemetry");
	assert.equal(
		record.body,
		"Telemetry initialization failed. Review the error details to determine the corrective action.",
	);
	assert.equal(new Date(record.timestamp).toISOString(), record.timestamp);
	assert.ok(record.error.includes(failure.message));
	assert.ok(record.error.includes(cause.message));
	assert.ok(record.error.includes("ECONNREFUSED"));
	assert.match(record.error, /InstrumentationSuite.ts/);
});

test("reports absent optional telemetry configuration at the information level", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	for (const key of Object.keys(process.env))
		if (key.startsWith("OTEL_")) delete process.env[key];
	const logged = context.mock.method(console, "log", () => {});
	const warnings = context.mock.method(console, "warn", () => {});
	const errors = context.mock.method(console, "error", () => {});
	const before = registrations.length;
	const { registerTelemetry } =
		await import("../src/instrumentation.node.ts");
	registerTelemetry();
	assert.equal(registrations.length, before);
	assert.equal(warnings.mock.callCount(), 0);
	assert.equal(errors.mock.callCount(), 0);
	const records = logged.mock.calls.map((call) =>
		JSON.parse(call.arguments[0]),
	);
	assert.deepEqual(
		records.map((record) => record.component),
		["traces", "metrics", "logs"],
	);
	for (const record of records) {
		assert.equal(record.severityText, "INFO");
		assert.equal(record.severityNumber, 9);
		assert.equal(
			record.body,
			"Telemetry initialization was skipped because no export endpoint is configured.",
		);
		assert.match(record.error, /Set OTEL_EXPORTER_OTLP_ENDPOINT/);
	}
});

for (const signal of ["TRACES", "METRICS", "LOGS"] as const) {
	test(`configures only the ${signal.toLowerCase()} exporter when it has an endpoint`, async (context) => {
		const environment = { ...process.env };
		context.after(() => {
			process.env = environment;
		});
		for (const key of Object.keys(process.env))
			if (key.startsWith("OTEL_")) delete process.env[key];
		process.env[`OTEL_EXPORTER_OTLP_${signal}_ENDPOINT`] =
			"http://127.0.0.1:1";
		const logged = context.mock.method(console, "log", () => {});
		const { registerTelemetry } =
			await import("../src/instrumentation.node.ts");
		const before = registrations.length;
		registerTelemetry();
		assert.equal(registrations.length, before + 1);
		assert.equal(logged.mock.callCount(), 2);
		for (const call of logged.mock.calls) {
			const record = JSON.parse(call.arguments[0]);
			assert.equal(record.severityText, "INFO");
			assert.equal(record.severityNumber, 9);
		}
		const configuration = registrations.at(-1) as {
			autoDetectResources: boolean;
			propagators: string[];
			spanProcessors: { shutdown(): Promise<void> }[];
			metricReaders: { shutdown(): Promise<void> }[];
			logRecordProcessors: { shutdown(): Promise<void> }[];
		};
		assert.equal(configuration.autoDetectResources, false);
		assert.deepEqual(configuration.propagators, ["tracecontext"]);
		assert.equal(
			configuration.spanProcessors.length,
			Number(signal === "TRACES"),
		);
		assert.equal(
			configuration.metricReaders.length,
			Number(signal === "METRICS"),
		);
		assert.equal(
			configuration.logRecordProcessors.length,
			Number(signal === "LOGS"),
		);
		context.after(async () => {
			await Promise.all(
				[
					...configuration.spanProcessors,
					...configuration.metricReaders,
					...configuration.logRecordProcessors,
				].map((processor) => processor.shutdown()),
			);
		});
	});
}

test("keeps configured traces and logs when the telemetry library rejects metric settings", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	for (const key of Object.keys(process.env))
		if (key.startsWith("OTEL_")) delete process.env[key];
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
	process.env.OTEL_METRIC_EXPORT_INTERVAL = "0";
	const logged = context.mock.method(console, "log", () => {});

	const { registerTelemetry } =
		await import("../src/instrumentation.node.ts");
	const before = registrations.length;
	registerTelemetry();
	assert.equal(registrations.length, before + 1);
	const configuration = registrations.at(-1) as {
		spanProcessors: { shutdown(): Promise<void> }[];
		metricReaders: { shutdown(): Promise<void> }[];
		logRecordProcessors: { shutdown(): Promise<void> }[];
	};
	assert.equal(configuration.spanProcessors.length, 1);
	assert.equal(configuration.metricReaders.length, 0);
	assert.equal(logged.mock.callCount(), 1);
	const record = JSON.parse(logged.mock.calls[0].arguments[0]);
	assert.equal(record.severityText, "ERROR");
	assert.equal(record.severityNumber, 17);
	assert.equal(record.component, "metrics");
	assert.equal(
		record.body,
		"Telemetry initialization failed. Review the error details to determine the corrective action.",
	);
	assert.match(record.error, /exportIntervalMillis must be greater than 0/);
	assert.equal(configuration.logRecordProcessors.length, 1);
	context.after(async () => {
		await Promise.all(
			[
				...configuration.spanProcessors,
				...configuration.logRecordProcessors,
			].map((processor) => processor.shutdown()),
		);
	});
});
