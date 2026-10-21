import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { storageRequest } from "./storage.ts";

suite("Applications without PostgreSQL", { timeout: 15000 }, () => {
	test("serves the website and reports unavailable counts", async () => {
		const origin = "http://website:10000";
		const page = await fetch(origin, { signal: AbortSignal.timeout(5000) });
		assert.equal(page.status, 200);
		assert.match(await page.text(), /<main[\s>]/);
		const response = await fetch(`${origin}/api/page-hits`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				"sec-fetch-site": "same-origin",
			},
			body: JSON.stringify({
				path: "/",
				operationId: crypto.randomUUID(),
			}),
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), {
			error: "Page count unavailable",
		});
	});

	test("keeps storage running while reporting database operations as unavailable", async () => {
		const liveness = await storageRequest("/health/live");
		assert.equal(liveness.status, 200);
		assert.deepEqual(await liveness.json(), { live: true });
		for (const path of ["/health/ready", "/v1/entries/example"]) {
			const response = await storageRequest(path);
			assert.equal(response.status, 503);
			assert.deepEqual(await response.json(), {
				error: "Storage unavailable",
			});
		}
	});
});
