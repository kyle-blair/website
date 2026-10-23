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
				source: "export function registerOTel(config) {if(globalThis.registrationFailure) throw new Error('private configuration'); globalThis.registrations.push(config);}",
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

test("keeps the website available when telemetry initialization fails", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
	Object.assign(globalThis, { registrationFailure: true });
	context.after(() =>
		Object.assign(globalThis, { registrationFailure: false }),
	);
	const messages: string[] = [];
	context.mock.method(process.stderr, "write", (message: string) => {
		messages.push(message);
		return true;
	});
	const { registerTelemetry } =
		await import("../src/instrumentation.node.ts");
	assert.doesNotThrow(() => registerTelemetry());
	assert.deepEqual(messages, ["Telemetry configuration unavailable\n"]);
});

test("does not initialize website telemetry without an endpoint", async (context) => {
	const environment = { ...process.env };
	context.after(() => {
		process.env = environment;
	});
	for (const key of Object.keys(process.env))
		if (key.startsWith("OTEL_")) delete process.env[key];
	const warning = context.mock.method(console, "warn", () => {});
	const before = registrations.length;
	const { registerTelemetry } =
		await import("../src/instrumentation.node.ts");
	registerTelemetry();
	assert.equal(registrations.length, before);
	assert.equal(warning.mock.callCount(), 0);
});
