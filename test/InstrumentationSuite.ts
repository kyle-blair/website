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
