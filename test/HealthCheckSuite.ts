import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);
const script = new URL("../scripts/health-check.mjs", import.meta.url).pathname;

test("health check accepts success and rejects unhealthy or stalled responses", async (context) => {
	const server = createServer((request, response) => {
		if (request.url === "/stalled") return;
		response.writeHead(request.url === "/healthy" ? 200 : 503).end();
	});
	server.listen(0, "127.0.0.1");
	await new Promise<void>((resolve) => server.once("listening", resolve));
	context.after(() => server.closeAllConnections());
	context.after(() => server.close());
	const address = server.address();
	assert.ok(address && typeof address !== "string");
	const origin = `http://127.0.0.1:${address.port}`;

	const success = await execute(process.execPath, [
		script,
		`${origin}/healthy`,
	]);
	assert.equal(success.stderr, "");
	const successLog = JSON.parse(success.stdout);
	assert.equal(successLog.severityText, "INFO");
	assert.equal(successLog.severityNumber, 9);
	assert.equal(successLog.url, `${origin}/healthy`);
	assert.equal(successLog.status, 200);
	assert.equal(successLog.body, "The health check succeeded.");
	assert.ok(Number.isFinite(Date.parse(successLog.timestamp)));
	await assert.rejects(
		execute(process.execPath, [script, `${origin}/unhealthy`]),
		(error: { code?: number; stdout?: string; stderr?: string }) => {
			assert.equal(error.code, 1);
			assert.equal(error.stdout, "");
			const log = JSON.parse(error.stderr ?? "");
			assert.equal(log.severityText, "ERROR");
			assert.equal(log.severityNumber, 17);
			assert.equal(log.url, `${origin}/unhealthy`);
			assert.equal(log.status, 503);
			assert.equal(
				log.body,
				"The health check received an unsuccessful response. Check the service logs to determine why the endpoint is failing.",
			);
			return true;
		},
	);
	await assert.rejects(
		execute(process.execPath, [script, `${origin}/stalled`], {
			timeout: 4000,
		}),
		(error: { code?: number; killed?: boolean; stderr?: string }) => {
			assert.equal(error.code, 1);
			assert.equal(error.killed, false);
			const log = JSON.parse(error.stderr ?? "");
			assert.equal(log.severityText, "ERROR");
			assert.equal(log.severityNumber, 17);
			assert.equal(log.url, `${origin}/stalled`);
			assert.equal(
				log.body,
				"The health check request failed. Check that the endpoint is reachable and responds within two seconds, and review the error details.",
			);
			assert.match(log.error, /TimeoutError/);
			return true;
		},
	);
	await assert.rejects(
		execute(process.execPath, [
			script,
			`${origin.replace("http:", "unsupported:")}/healthy`,
		]),
		(error: { code?: number; stderr?: string }) => {
			assert.equal(error.code, 1);
			const log = JSON.parse(error.stderr ?? "");
			assert.equal(log.severityText, "ERROR");
			assert.match(log.error, /fetch failed/);
			assert.match(log.error, /unknown scheme/);
			return true;
		},
	);
});
