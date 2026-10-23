import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const service = process.env.TELEMETRY_TEST_SERVICE;
assert.ok(service === "website" || service === "storage");

for (const scenario of [
	"configured",
	"unconfigured",
	"unreachable",
	"rejected",
	"timeout",
	"invalid",
]) {
	await test(`${service}: ${scenario} telemetry preserves service availability and shutdown`, async () => {
		const requests: {
			path: string | undefined;
			headers: IncomingHttpHeaders;
			body: Buffer;
		}[] = [];
		const endpoint = createServer(async (request, response) => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(chunk);
			requests.push({
				path: request.url,
				headers: request.headers,
				body: Buffer.concat(chunks),
			});
			if (scenario === "timeout") return;
			response.statusCode = scenario === "rejected" ? 401 : 200;
			response.setHeader("content-type", "application/x-protobuf");
			response.end();
		});
		endpoint.listen(0, "127.0.0.1");
		await once(endpoint, "listening");
		const environment = { ...process.env };
		assert.ok(environment.STORAGE_SERVICE_TOKEN);
		for (const key of Object.keys(environment))
			if (key.startsWith("OTEL_")) delete environment[key];
		const destination =
			scenario === "unconfigured"
				? ""
				: scenario === "unreachable"
					? "http://127.0.0.1:1"
					: scenario === "invalid"
						? "%invalid"
						: `http://127.0.0.1:${(endpoint.address() as AddressInfo).port}/otlp`;
		const child = spawn(
			process.execPath,
			service === "website"
				? ["server.js"]
				: [
						"--import",
						"./services/storage/src/instrumentation.ts",
						"services/storage/src/server.ts",
					],
			{
				env: {
					...environment,
					HOSTNAME: "127.0.0.1",
					PORT: "10002",
					STORAGE_SERVICE_URL: "http://127.0.0.1:65534",
					STORAGE_ALLOW_HTTP: "true",
					PGHOST: "127.0.0.1",
					PGPORT: "1",
					DATABASE_URL: "",
					OTEL_EXPORTER_OTLP_ENDPOINT: destination,
					OTEL_EXPORTER_OTLP_HEADERS:
						"Authorization=Basic%20dGVzdDp0ZXN0",
					OTEL_METRIC_EXPORT_INTERVAL: "100",
					OTEL_BSP_SCHEDULE_DELAY: "100",
					OTEL_BLRP_SCHEDULE_DELAY: "100",
				},
				stdio: ["ignore", "pipe", "pipe"],
			},
		);
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		const exited = once(child, "exit");
		const healthPath =
			service === "website" ? "/api/health" : "/health/live";
		const origin = "http://127.0.0.1:10002";
		try {
			let ready = false;
			for (let attempt = 0; attempt < 100; attempt++) {
				if (child.exitCode !== null) throw new Error(output);
				try {
					const response = await fetch(origin + healthPath, {
						signal: AbortSignal.timeout(1000),
					});
					await response.text();
					if (response.ok) {
						ready = true;
						break;
					}
				} catch {}
				await delay(100);
			}
			assert.ok(ready, `${service} ${scenario}: ${output}`);
			const path =
				service === "website"
					? "/api/feedback?subject=telemetry-probe"
					: "/v1/entries/telemetry-probe";
			const response = await fetch(origin + path, {
				headers: {
					authorization: `Bearer ${environment.STORAGE_SERVICE_TOKEN}`,
					traceparent:
						"00-0123456789abcdef0123456789abcdef-0123456789abcdef-01",
				},
				signal: AbortSignal.timeout(3000),
			});
			assert.equal(response.status, 503, `${service} ${scenario}`);
			await response.text();
			if (["configured", "rejected", "timeout"].includes(scenario)) {
				for (
					let attempt = 0;
					attempt < 50 &&
					!["traces", "metrics", "logs"].every((signal) =>
						requests.some(
							(request) => request.path === `/otlp/v1/${signal}`,
						),
					);
					attempt++
				)
					await delay(100);
				for (const signal of ["traces", "metrics", "logs"]) {
					const request = requests.find(
						(request) => request.path === `/otlp/v1/${signal}`,
					);
					assert.ok(
						request,
						`${service} ${scenario}: no ${signal} export; ${output}`,
					);
					assert.equal(
						request.headers.authorization,
						"Basic dGVzdDp0ZXN0",
					);
					assert.equal(
						request.headers["content-type"],
						"application/x-protobuf",
					);
					assert.ok(request.body.length > 0);
					assert.ok(
						!request.body.includes(
							Buffer.from(environment.STORAGE_SERVICE_TOKEN!),
						),
					);
				}
				const traces = requests.filter(
					(request) => request.path === "/otlp/v1/traces",
				);
				assert.ok(
					traces.some((request) =>
						request.body.includes(
							Buffer.from(
								"0123456789abcdef0123456789abcdef",
								"hex",
							),
						),
					),
				);
				for (const scope of service === "website"
					? ["@opentelemetry/instrumentation-undici"]
					: ["@fastify/otel", "@opentelemetry/instrumentation-pg"])
					assert.ok(
						traces.some((request) =>
							request.body.includes(Buffer.from(scope)),
						),
						`${service}: missing ${scope}`,
					);
			}
			const health = await fetch(origin + healthPath, {
				signal: AbortSignal.timeout(1000),
			});
			assert.equal(
				health.status,
				200,
				`${service} failed while exporting telemetry`,
			);
			await health.text();
			if (scenario === "unconfigured")
				assert.doesNotMatch(output, /[Tt]elemetry|OTEL_/);
			child.kill("SIGTERM");
			const result = await Promise.race([
				exited,
				delay(10000, undefined, { ref: false }).then(() => {
					throw new Error(
						`${service} ${scenario}: shutdown exceeded ten seconds`,
					);
				}),
			]);
			assert.deepEqual(
				result,
				[service === "website" ? 143 : 0, null],
				output,
			);
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
				await exited;
			}
			endpoint.closeAllConnections();
			await new Promise<void>((resolve, reject) =>
				endpoint.close((error) => (error ? reject(error) : resolve())),
			);
		}
	});
}
