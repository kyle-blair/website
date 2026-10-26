import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { once } from "node:events";
import { Worker } from "node:worker_threads";
import { PageHitsEndpoint } from "../src/app/api/page-hits/page-hits-endpoint.ts";

suite("Page hit endpoint", () => {
	function createEndpoint(
		increment: (key: string, operationId: string) => Promise<number>,
		isPublishedPage: (path: string) => Promise<boolean>,
	) {
		return new PageHitsEndpoint(
			{
				read: async () => 0,
				adjust: (key, operationId) => increment(key, operationId),
			},
			isPublishedPage,
		);
	}

	for (const publicOrigin of [
		"https://zerofourtwo.com",
		"http://localhost:3000",
	]) {
		test(`accepts ${publicOrigin} behind a proxy without configuring its address`, async () => {
			const endpoint = createEndpoint(
				async () => 7,
				async () => true,
			);
			for (const metadata of [true, false]) {
				const response = await endpoint.record(
					new Request("http://0.0.0.0:10000/api/page-hits", {
						method: "POST",
						headers: {
							origin: publicOrigin,
							host: new URL(publicOrigin).host,
							"content-type": "application/json",
							...(metadata
								? { "sec-fetch-site": "same-origin" }
								: {}),
						},
						body: JSON.stringify({
							path: "/",
							operationId: crypto.randomUUID(),
						}),
					}),
				);
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), { count: 7 });
			}
		});
	}

	test("rejects requests from other browser origins even when origin metadata is forged", async () => {
		const endpoint = createEndpoint(
			async () => {
				assert.fail("Must not reach the counter store");
			},
			async () => true,
		);
		for (const site of ["cross-site", "same-site", "none", "unknown"]) {
			const incoming = request({ path: "/", operationId });
			incoming.headers.set("sec-fetch-site", site);
			assert.equal((await endpoint.record(incoming)).status, 403);
		}
		for (const origin of ["null", "invalid", "ftp://website.example"]) {
			assert.equal(
				(
					await endpoint.record(
						request({ path: "/", operationId }, origin),
					)
				).status,
				403,
			);
		}
	});

	test("requires JSON so browser forms cannot submit page views", async () => {
		const endpoint = createEndpoint(
			async () => 7,
			async () => true,
		);
		for (const contentType of [
			null,
			"text/plain",
			"application/x-www-form-urlencoded",
			"multipart/form-data",
		]) {
			const incoming = request({ path: "/", operationId });
			if (contentType === null) incoming.headers.delete("content-type");
			else incoming.headers.set("content-type", contentType);
			assert.equal((await endpoint.record(incoming)).status, 415);
		}
		const incoming = request({ path: "/", operationId });
		incoming.headers.set("content-type", "application/json; charset=utf-8");
		assert.equal((await endpoint.record(incoming)).status, 200);
	});

	test("rejects the internal origin and forged forwarding headers", async () => {
		const endpoint = createEndpoint(
			async () => {
				assert.fail("Must not reach the counter store");
			},
			async () => true,
		);
		for (const origin of [
			"https://0.0.0.0:10000",
			"https://attacker.example",
		]) {
			const response = await endpoint.record(
				new Request("https://0.0.0.0:10000/api/page-hits", {
					method: "POST",
					headers: {
						origin,
						"x-forwarded-host": "attacker.example",
						host: "website.example",
						"x-forwarded-proto": "https",
						"content-type": "application/json",
					},
					body: JSON.stringify({
						path: "/",
						operationId: crypto.randomUUID(),
					}),
				}),
			);
			assert.equal(response.status, 403);
		}
	});

	test("accepts the request byte boundary and rejects larger JSON before consulting the counter store", async () => {
		let calls = 0;
		const endpoint = createEndpoint(
			async () => {
				calls += 1;
				return 1;
			},
			async () => true,
		);
		const empty = JSON.stringify({ path: "/", operationId, padding: "" });
		for (const size of [8192, 8193]) {
			const incoming = request({
				path: "/",
				operationId,
				padding: "x".repeat(size - empty.length),
			});
			assert.equal(incoming.headers.get("content-length"), null);
			const response = await endpoint.record(incoming);
			assert.equal(response.status, size === 8192 ? 200 : 413);
			assert.equal(
				response.headers.get("cache-control"),
				"private, no-store",
			);
		}
		assert.equal(calls, 1);
		const response = await endpoint.record(
			request({ path: "/", operationId, padding: "文".repeat(3000) }),
		);
		assert.equal(response.status, 413);
		assert.deepEqual(await response.json(), {
			error: "Request body too large",
		});
		assert.equal(calls, 1);
	});

	for (const cancellationFails of [false, true]) {
		test(`stops reading oversized streams when cancellation ${cancellationFails ? "fails" : "succeeds"}`, async () => {
			const endpoint = createEndpoint(
				async () => {
					assert.fail(
						"Oversized requests must not reach the counter store",
					);
				},
				async () => {
					assert.fail(
						"Oversized requests must not reach the catalogue",
					);
				},
			);
			const encoded = new TextEncoder().encode(
				JSON.stringify({
					path: "/",
					operationId,
					padding: "x".repeat(20000),
				}),
			);
			let offset = 0;
			let cancelled = false;
			const body = new ReadableStream<Uint8Array>(
				{
					pull(controller) {
						if (offset === encoded.length) controller.close();
						else {
							controller.enqueue(
								encoded.subarray(offset, offset + 4096),
							);
							offset = Math.min(offset + 4096, encoded.length);
						}
					},
					cancel() {
						cancelled = true;
						if (cancellationFails)
							throw new Error("Cancellation failed");
					},
				},
				{ highWaterMark: 0 },
			);
			const options = {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"content-length": "1",
				},
				body,
				duplex: "half",
			};
			const response = await endpoint.record(
				new Request("https://website.example/api/page-hits", options),
			);
			assert.equal(response.status, 413);
			assert.equal(cancelled, true);
			assert.ok(offset < encoded.length);
			assert.equal(body.locked, false);
		});
	}

	test("accepts streamed JSON with a multibyte character split between chunks", async () => {
		const path = "/blog/文";
		const endpoint = createEndpoint(
			async () => 1,
			async (submitted) => submitted === path,
		);
		const encoded = new TextEncoder().encode(
			JSON.stringify({ path, operationId }),
		);
		const body = new ReadableStream<Uint8Array>({
			start(controller) {
				for (const byte of encoded)
					controller.enqueue(Uint8Array.of(byte));
				controller.close();
			},
		});
		const options = {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
			duplex: "half",
		};
		assert.equal(
			(
				await endpoint.record(
					new Request(
						"https://website.example/api/page-hits",
						options,
					),
				)
			).status,
			200,
		);
		assert.equal(body.locked, false);
	});

	test("contains missing and interrupted request bodies", async () => {
		const endpoint = createEndpoint(
			async () => {
				assert.fail("Invalid bodies must not reach the counter store");
			},
			async () => true,
		);
		const missing = new Request("https://website.example/api/page-hits", {
			method: "POST",
			headers: { "content-type": "application/json" },
		});
		assert.equal((await endpoint.record(missing)).status, 400);
		const body = new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.error(new Error("Connection lost"));
			},
		});
		const options = {
			method: "POST",
			headers: { "content-type": "application/json" },
			body,
			duplex: "half",
		};
		assert.equal(
			(
				await endpoint.record(
					new Request(
						"https://website.example/api/page-hits",
						options,
					),
				)
			).status,
			400,
		);
		assert.equal(body.locked, false);
	});

	test("rejects oversized encoded and decoded paths before consulting the catalogue", async () => {
		const endpoint = createEndpoint(
			async () => {
				assert.fail("Must not reach the counter store");
			},
			async () => {
				assert.fail("Oversized paths must not reach the catalogue");
			},
		);
		for (const path of ["/" + "a".repeat(4096), "/" + "%61".repeat(501)]) {
			assert.equal(
				(await endpoint.record(request({ path, operationId }))).status,
				400,
			);
		}
	});

	test("rejects a malicious path without blocking the request worker", async (context) => {
		const worker = new Worker(
			new URL("./fixtures/page-hit-request-worker.ts", import.meta.url),
		);
		context.after(async () => {
			await worker.terminate();
		});
		await once(worker, "message", { signal: AbortSignal.timeout(10000) });
		const result = once(worker, "message", {
			signal: AbortSignal.timeout(1000),
		});
		worker.postMessage("/" + "a".repeat(64) + "!");
		const [status] = await result;
		assert.equal(status, 400);
	});
	const operationId = "42c26729-670f-4c77-b218-dfb0820ad912";
	function request(body: unknown, origin = "https://website.example") {
		return new Request("https://website.example/api/page-hits", {
			method: "POST",
			headers: { "content-type": "application/json", origin },
			body: JSON.stringify(body),
		});
	}

	test("increments only a published page and returns a private uncached count", async () => {
		const calls: unknown[] = [];
		const endpoint = createEndpoint(
			async (key, operation) => {
				calls.push([key, operation]);
				return 7;
			},
			async (path) => path === "/blog",
		);
		const response = await endpoint.record(
			request({ path: "/blog", operationId }),
		);
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { count: 7 });
		assert.equal(
			response.headers.get("cache-control"),
			"private, no-store",
		);
		assert.deepEqual(calls, [["hits:page:/blog", operationId]]);
	});

	test("rejects arbitrary paths, malformed submissions, and cross-site requests before the counter store", async () => {
		const endpoint = createEndpoint(
			async () => {
				assert.fail("Must not reach the counter store");
			},
			async () => false,
		);
		for (const body of [
			null,
			{},
			{ path: "/", operationId: "invalid" },
			{ path: "/?person=123", operationId },
			{ path: "/missing", operationId },
			{ path: "/%", operationId },
		]) {
			assert.equal((await endpoint.record(request(body))).status, 400);
		}
		assert.equal(
			(
				await endpoint.record(
					request(
						{ path: "/", operationId },
						"https://other.example",
					),
				)
			).status,
			403,
		);
		assert.equal(
			(
				await endpoint.record(
					new Request("https://website.example/api/page-hits", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: "{",
					}),
				)
			).status,
			400,
		);
	});

	test("normalizes encoded published paths without retaining query strings", async () => {
		const endpoint = createEndpoint(
			async (key) => {
				assert.equal(key, "hits:page:/blog/文");
				return 1;
			},
			async (path) => path === "/blog/文",
		);
		assert.equal(
			(
				await endpoint.record(
					request({ path: "/blog/%E6%96%87", operationId }),
				)
			).status,
			200,
		);
	});

	test("reports page catalogue failures as temporary unavailability", async () => {
		const endpoint = createEndpoint(
			async () => 1,
			async () => {
				throw new Error("catalogue unavailable");
			},
		);
		assert.equal(
			(await endpoint.record(request({ path: "/", operationId }))).status,
			503,
		);
	});

	test("contains counter-store failures and never exposes errors or visitor details", async () => {
		const endpoint = createEndpoint(
			async () => {
				throw new Error("secret database credentials");
			},
			async () => true,
		);
		const response = await endpoint.record(
			request({ path: "/", operationId }),
		);
		assert.equal(response.status, 503);
		assert.deepEqual(await response.json(), {
			error: "Page count unavailable",
		});
	});
});
