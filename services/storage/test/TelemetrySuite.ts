import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { context, trace } from "@opentelemetry/api";
import { startTelemetry } from "../src/telemetry-sdk.ts";
import { observe } from "../../../shared/telemetry.ts";

test("automatically instruments real HTTP and Fastify requests while retaining private application diagnostics", async (contextTest) => {
	const requests: { path: string; data: Buffer }[] = [];
	const endpoint = createServer(async (request, response) => {
		const chunks: Buffer[] = [];
		for await (const chunk of request) chunks.push(chunk);
		requests.push({
			path: request.url!,
			data: Buffer.concat(chunks),
		});
		response.setHeader("content-type", "application/x-protobuf");
		response.end();
	});
	endpoint.listen(0, "127.0.0.1");
	await once(endpoint, "listening");
	const previous = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = `http://127.0.0.1:${(endpoint.address() as { port: number }).port}`;
	contextTest.after(() => {
		endpoint.closeAllConnections();
		endpoint.close();
		if (previous === undefined)
			delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
		else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previous;
	});
	const telemetry = startTelemetry("test-storage")!;
	assert.equal(startTelemetry("test-storage"), telemetry);
	const { createApplication } = await import("../src/application.ts");
	const app = createApplication(
		{
			read: async () => ({ found: false }),
			increment: async () => {
				throw Object.assign(
					new Error("secret credentials and visitor address"),
					{ code: "28P01" },
				);
			},
			check: async () => {},
		},
		"secret",
	);
	await app.listen({ host: "127.0.0.1", port: 0 });
	contextTest.after(() => app.close());
	const port = (app.server.address() as { port: number }).port;
	const http = createRequire(import.meta.url)(
		"node:http",
	) as typeof import("node:http");
	async function request(
		method: string,
		path: string,
		authenticated: boolean,
		body?: string,
	) {
		return new Promise<number>((resolve, reject) => {
			const call = http.request(
				{
					hostname: "127.0.0.1",
					port,
					method,
					path,
					headers: {
						"content-type": "application/json",
						...(authenticated
							? { authorization: "Bearer secret" }
							: {}),
					},
				},
				(response) => {
					response.resume();
					response.on("end", () => resolve(response.statusCode!));
				},
			);
			call.on("error", reject);
			call.end(body);
		});
	}
	let parentTrace = "";
	await observe("test.parent", async () => {
		parentTrace = trace.getSpan(context.active())!.spanContext().traceId;
		assert.equal(
			await request("GET", "/v1/entries/private-key", true),
			200,
		);
	});
	assert.equal(await request("GET", "/v1/entries/private-key", false), 401);
	assert.equal(
		await request("POST", "/v1/entries/private-key/increment", true, "{}"),
		400,
	);
	assert.equal(
		await request(
			"POST",
			"/v1/entries/private-key/increment",
			true,
			JSON.stringify({ operationId: crypto.randomUUID() }),
		),
		503,
	);
	assert.equal(await request("GET", "/private-unknown-path", false), 404);
	for (const milliseconds of [10, 100]) {
		let tick = 0;
		const clock = contextTest.mock.method(
			performance,
			"now",
			() => tick++ * milliseconds,
		);
		await observe(`test.duration.${milliseconds}`, async () => 1);
		clock.mock.restore();
	}
	await assert.rejects(
		observe("test.error", async () => {
			throw new TypeError("secret credentials and visitor address", {
				cause: Object.assign(new Error("secret credentials"), {
					code: "ECONNREFUSED",
				}),
			});
		}),
	);
	await app.close();
	await telemetry.shutdown();
	const traces = requests.filter((request) => request.path === "/v1/traces");
	for (const name of [
		"@opentelemetry/instrumentation-http",
		"@fastify/otel",
		"ECONNREFUSED",
	])
		assert.ok(
			traces.some((request) => request.data.includes(name)),
			`Missing trace diagnostic ${name}`,
		);
	assert.ok(
		traces.some((request) =>
			request.data.includes(Buffer.from(parentTrace, "hex")),
		),
	);
	assert.ok(
		requests.some(
			(request) =>
				request.path === "/v1/logs" && request.data.includes("28P01"),
		),
	);
	assert.doesNotMatch(
		Buffer.concat(requests.map((request) => request.data)).toString(),
		/secret credentials|visitor address|private-key|private-unknown-path/,
	);
	for (const name of [
		"website.operations",
		"website.operation.duration",
		"test.duration.10",
		"test.duration.100",
	])
		assert.ok(
			requests.some(
				(request) =>
					request.path === "/v1/metrics" &&
					request.data.includes(name),
			),
			`Missing metric ${name}`,
		);
});

for (const settings of [
	{},
	{ OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1" },
	{ OTEL_EXPORTER_OTLP_ENDPOINT: "%invalid" },
]) {
	test(`keeps application work available with telemetry settings ${JSON.stringify(settings)}`, () => {
		const environment = { ...process.env };
		for (const key of Object.keys(environment))
			if (key.startsWith("OTEL_")) delete environment[key];
		const result = spawnSync(
			process.execPath,
			[
				new URL("./fixtures/telemetry-worker.ts", import.meta.url)
					.pathname,
			],
			{
				encoding: "utf8",
				timeout: 8000,
				env: { ...environment, ...settings },
			},
		);
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /completed/);
		if (Object.keys(settings).length === 0)
			assert.doesNotMatch(result.stderr, /[Tt]elemetry|OTEL_/);
	});
}
