import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { spawn } from "node:child_process";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const service = process.env.TELEMETRY_TEST_SERVICE;
assert.equal(service, "website");

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
		const child = spawn(process.execPath, ["server.js"], {
			env: {
				...environment,
				HOSTNAME: "127.0.0.1",
				PORT: "10002",
				DATABASE_URL: "postgresql://website@127.0.0.1:1/website",
				OTEL_EXPORTER_OTLP_ENDPOINT: destination,
				OTEL_EXPORTER_OTLP_HEADERS:
					"Authorization=Basic%20dGVzdDp0ZXN0",
				OTEL_METRIC_EXPORT_INTERVAL: "100",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});
		let output = "";
		child.stdout.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr.on("data", (chunk) => {
			output += chunk;
		});
		const exited = once(child, "exit");
		const healthPath = "/api/health";
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
			const path = "/api/feedback?subject=telemetry-probe";
			const response = await fetch(origin + path, {
				headers: {
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
				for (const scope of ["@opentelemetry/instrumentation-pg"])
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
			if (scenario === "unconfigured") {
				const records = output
					.split("\n")
					.filter((line) => line.startsWith("{"))
					.map((line) => JSON.parse(line));
				assert.deepEqual(
					records.map((record) => record.component),
					["traces", "metrics", "logs"],
				);
				for (const record of records) {
					assert.equal(record.severityText, "INFO");
					assert.equal(record.severityNumber, 9);
					assert.ok(record.error.length > 0);
				}
			}
			child.kill("SIGTERM");
			const result = await Promise.race([
				exited,
				delay(10000, undefined, { ref: false }).then(() => {
					throw new Error(
						`${service} ${scenario}: shutdown exceeded ten seconds`,
					);
				}),
			]);
			assert.deepEqual(result, [143, null], output);
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
