import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

async function probe(schedule) {
	const received = [];
	const collector = createServer(async (request, response) => {
		const chunks = [];
		for await (const chunk of request) chunks.push(chunk);
		if (request.url === "/v1/traces")
			received.push(JSON.parse(Buffer.concat(chunks).toString()));
		response.setHeader("content-type", "application/json");
		response.end("{}");
	});
	collector.listen(0, "127.0.0.1");
	await once(collector, "listening");
	const server = spawn(process.execPath, ["server.js"], {
		env: {
			...process.env,
			HOSTNAME: "127.0.0.1",
			PORT: "10002",
			OTEL_EXPORTER_OTLP_ENDPOINT: `http://127.0.0.1:${collector.address().port}`,
			OTEL_BSP_SCHEDULE_DELAY: String(schedule),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	server.stdout.on("data", (chunk) => {
		output += chunk;
	});
	server.stderr.on("data", (chunk) => {
		output += chunk;
	});
	const exited = once(server, "exit");
	try {
		let ready = false;
		for (let attempt = 0; attempt < 100; attempt++) {
			if (server.exitCode !== null) throw new Error(output);
			try {
				if ((await fetch("http://127.0.0.1:10002/api/health")).ok) {
					ready = true;
					break;
				}
			} catch {}
			await delay(100);
		}
		assert.ok(ready, output);
		const traceId = crypto.randomUUID().replaceAll("-", "");
		const response = await fetch(
			"http://127.0.0.1:10002/api/feedback?subject=shutdown-probe",
			{ headers: { traceparent: `00-${traceId}-0123456789abcdef-01` } },
		);
		assert.equal(response.status, 200);
		await response.text();
		const spans = () =>
			received.flatMap((batch) =>
				batch.resourceSpans.flatMap((resource) =>
					resource.scopeSpans.flatMap((scope) => scope.spans),
				),
			);
		const exported = () => spans().some((span) => span.traceId === traceId);
		if (schedule === 50) {
			for (let attempt = 0; attempt < 50 && !exported(); attempt++)
				await delay(100);
			assert.ok(
				exported(),
				"Automatic telemetry must export while the standalone server is running",
			);
			assert.ok(
				received.some((batch) =>
					JSON.stringify(batch).includes(
						"@opentelemetry/instrumentation-undici",
					),
				),
				"Missing automatic fetch instrumentation",
			);
		}
		server.kill("SIGTERM");
		const result = await Promise.race([
			exited,
			delay(10000, undefined, { ref: false }).then(() => {
				throw new Error("Standalone shutdown exceeded ten seconds");
			}),
		]);
		assert.deepEqual(result, [143, null], output);
		process.stdout.write(
			JSON.stringify({
				scheduleMilliseconds: schedule,
				finalRequestExported: exported(),
				exitCode: result[0],
			}) + "\n",
		);
	} finally {
		if (server.exitCode === null && server.signalCode === null)
			server.kill("SIGKILL");
		collector.closeAllConnections();
		await new Promise((resolve) => collector.close(resolve));
	}
}
await probe(50);
await probe(60000);
