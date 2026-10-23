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

	await execute(process.execPath, [script, `${origin}/healthy`]);
	await assert.rejects(
		execute(process.execPath, [script, `${origin}/unhealthy`]),
	);
	await assert.rejects(
		execute(process.execPath, [script, `${origin}/stalled`], {
			timeout: 4000,
		}),
		(error: { killed?: boolean; stderr?: string }) => {
			assert.equal(error.killed, false);
			assert.match(error.stderr ?? "", /TimeoutError/);
			return true;
		},
	);
});
