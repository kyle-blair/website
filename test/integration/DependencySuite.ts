import assert from "node:assert/strict";
import { suite, test } from "node:test";

suite("Website without PostgreSQL", { timeout: 15000 }, () => {
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
});
