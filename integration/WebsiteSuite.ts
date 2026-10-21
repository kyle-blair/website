import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { readCount } from "./storage.ts";

const origin = new URL("http://website:10000");

function pageView(
	path: string,
	operationId = crypto.randomUUID(),
	requestOrigin = origin.origin,
) {
	return fetch(new URL("/api/page-hits", origin), {
		method: "POST",
		headers: {
			"content-type": "application/json",
			origin: requestOrigin,
			"sec-fetch-site":
				requestOrigin === origin.origin ? "same-origin" : "cross-site",
		},
		body: JSON.stringify({ path, operationId }),
		signal: AbortSignal.timeout(5000),
	});
}

suite("Website, storage, and PostgreSQL containers", { timeout: 30000 }, () => {
	test("serves page markup with a loading counter before recording a view", async () => {
		const before = await readCount("hits:page:/");
		const response = await fetch(origin, {
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(response.status, 200);
		const html = await response.text();
		assert.match(html, /<main[\s>]/);
		assert.match(html, /aria-label="Loading page views"/);
		assert.equal(html.includes(process.env.STORAGE_SERVICE_TOKEN!), false);
		assert.equal(await readCount("hits:page:/"), before);
	});

	test("accepts the configured browser origin and persists counts through all services", async () => {
		for (const path of ["/", "/blog", "/contact"]) {
			const key = `hits:page:${path}`;
			const before = await readCount(key);
			const operationId = crypto.randomUUID();
			for (const identifier of [operationId, operationId.toUpperCase()]) {
				const response = await pageView(path, identifier);
				assert.equal(response.status, 200);
				assert.equal(
					response.headers.get("cache-control"),
					"private, no-store",
				);
				assert.deepEqual(await response.json(), { count: before + 1 });
			}
			assert.equal(await readCount(key), before + 1);
		}
	});

	test("rejects cross-site requests without changing stored counts", async () => {
		const before = await readCount("hits:page:/");
		const response = await pageView(
			"/",
			crypto.randomUUID(),
			"https://example.invalid",
		);
		assert.equal(response.status, 403);
		assert.equal(await readCount("hits:page:/"), before);
	});

	test("rejects oversized bodies with and without a content length without recording a view", async () => {
		const before = await readCount("hits:page:/");
		const payload = new TextEncoder().encode(
			JSON.stringify({
				path: "/",
				operationId: crypto.randomUUID(),
				padding: "x".repeat(65536),
			}),
		);
		for (const streamed of [false, true]) {
			const options = {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"sec-fetch-site": "same-origin",
				},
				body: streamed
					? new ReadableStream<Uint8Array>({
							start(controller) {
								controller.enqueue(payload.subarray(0, 4096));
								controller.enqueue(payload.subarray(4096));
								controller.close();
							},
						})
					: payload,
				duplex: "half",
				signal: AbortSignal.timeout(5000),
			};
			const response = await fetch(
				new URL("/api/page-hits", origin),
				options,
			);
			assert.equal(response.status, 413);
			assert.deepEqual(await response.json(), {
				error: "Request body too large",
			});
		}
		assert.equal(await readCount("hits:page:/"), before);
	});

	test("rejects malformed paths while the website remains responsive", async () => {
		const response = await pageView(`/${"a".repeat(64)}!`);
		assert.equal(response.status, 400);
		const health = await fetch(new URL("/api/health", origin), {
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(health.status, 200);
	});
});
