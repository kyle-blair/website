import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { GET, POST } from "../src/app/api/feedback/route.ts";

suite("Feedback routes", () => {
	test("reads and records anonymous item feedback, rejecting invalid submissions before storage", async (context) => {
		const originalFetch = globalThis.fetch;
		const originalEnvironment = { ...process.env };
		context.after(() => {
			globalThis.fetch = originalFetch;
			for (const key of [
				"STORAGE_SERVICE_URL",
				"STORAGE_SERVICE_TOKEN",
				"STORAGE_ALLOW_HTTP",
			]) {
				if (originalEnvironment[key] === undefined)
					delete process.env[key];
				else process.env[key] = originalEnvironment[key];
			}
		});
		process.env.STORAGE_SERVICE_URL = "https://storage.example";
		process.env.STORAGE_SERVICE_TOKEN = "secret";
		const counts = new Map<string, number>();
		const operations = new Set<string>();
		const requests: Request[] = [];
		globalThis.fetch = async (input, options) => {
			const request = new Request(input, options);
			requests.push(request);
			const key = decodeURIComponent(
				new URL(request.url).pathname.split("/")[3],
			);
			if (request.method === "POST") {
				const { operationId } = await request.json();
				const amount = new URL(request.url).pathname.endsWith(
					"/decrement",
				)
					? -1
					: 1;
				if (!operations.has(operationId)) {
					counts.set(key, (counts.get(key) ?? 0) + amount);
					operations.add(operationId);
				}
				return Response.json({ value: counts.get(key) });
			}
			return Response.json(
				counts.has(key)
					? { found: true, value: counts.get(key) }
					: { found: false },
			);
		};
		const subject = "item:example:first";
		const get = (subject: string) =>
			GET(
				new Request(
					`https://website.example/api/feedback?subject=${encodeURIComponent(subject)}`,
				),
			);
		const post = (
			submission: unknown,
			headers: Record<string, string> = {},
		) =>
			POST(
				new Request("https://website.example/api/feedback", {
					method: "POST",
					headers: { "content-type": "application/json", ...headers },
					body: JSON.stringify(submission),
				}),
			);
		assert.deepEqual(await (await get(subject)).json(), {
			likes: 0,
			dislikes: 0,
		});
		const operationId = crypto.randomUUID();
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await post({
				subject,
				reaction: "like",
				operationId,
			});
			assert.equal(response.status, 200);
			assert.equal(
				response.headers.get("cache-control"),
				"private, no-store",
			);
			assert.deepEqual(await response.json(), { likes: 1, dislikes: 0 });
		}
		assert.deepEqual(
			await (
				await post({
					subject,
					reaction: "dislike",
					operationId: crypto.randomUUID(),
				})
			).json(),
			{ likes: 1, dislikes: 1 },
		);
		for (const reaction of ["like", "dislike"]) {
			const withdrawal = {
				subject,
				reaction,
				selected: false,
				operationId: crypto.randomUUID(),
			};
			for (let attempt = 0; attempt < 2; attempt++) {
				const response = await post(withdrawal);
				assert.equal(response.status, 200);
				assert.deepEqual(await response.json(), {
					likes: 0,
					dislikes: reaction === "like" ? 1 : 0,
				});
			}
		}
		for (const item of [
			"item:example:second",
			"/unpublished#item",
			"item:50%",
			"x".repeat(500),
		]) {
			assert.deepEqual(await (await get(item)).json(), {
				likes: 0,
				dislikes: 0,
			});
			const result = await post({
				subject: item,
				reaction: "dislike",
				operationId: crypto.randomUUID(),
			});
			assert.equal(result.status, 200);
			assert.deepEqual(await result.json(), { likes: 0, dislikes: 1 });
			assert.equal(counts.get(`dislikes:${item}`), 1);
		}
		const before = requests.length;
		for (const invalid of [
			null,
			{},
			{ subject, reaction: "other", operationId },
			{ subject, reaction: "like", operationId: "invalid" },
			{ subject: "", reaction: "like", operationId },
			{ path: "/blog/example", reaction: "like", operationId },
			{ subject: 1, reaction: "like", operationId },
			{ subject: "item:\n", reaction: "like", operationId },
			{ subject, reaction: "like", selected: null, operationId },
			{ subject, reaction: "like", selected: "false", operationId },
		])
			assert.equal((await post(invalid)).status, 400);
		for (const invalid of [
			"",
			" leading-space",
			"trailing-space ",
			"x".repeat(501),
			"x".repeat(5000),
		])
			assert.equal((await get(invalid)).status, 400);
		assert.equal(
			(await GET(new Request("https://website.example/api/feedback")))
				.status,
			400,
		);
		assert.equal(
			(
				await post(
					{ subject, reaction: "like", operationId },
					{ "sec-fetch-site": "cross-site" },
				)
			).status,
			403,
		);
		assert.equal(
			(
				await post(
					{ subject, reaction: "like", operationId },
					{ "content-type": "text/plain" },
				)
			).status,
			415,
		);
		assert.equal(
			(
				await post({
					subject,
					reaction: "like",
					operationId,
					padding: "x".repeat(9000),
				})
			).status,
			413,
		);
		assert.equal(requests.length, before);
		globalThis.fetch = async () => {
			throw new Error("secret service failure");
		};
		assert.deepEqual(await (await get(subject)).json(), {
			error: "Feedback unavailable",
		});
		assert.equal(
			(await post({ subject, reaction: "like", operationId })).status,
			503,
		);
		delete process.env.STORAGE_SERVICE_URL;
		delete process.env.STORAGE_SERVICE_TOKEN;
		delete process.env.STORAGE_ALLOW_HTTP;
		assert.equal((await get(subject)).status, 503);
		assert.equal(
			(await post({ subject, reaction: "like", operationId })).status,
			503,
		);
		process.env.STORAGE_SERVICE_URL = "http://storage:10000";
		process.env.STORAGE_SERVICE_TOKEN = "secret";
		process.env.STORAGE_ALLOW_HTTP = "true";
		globalThis.fetch = async () => Response.json({ found: false });
		assert.equal((await get("/")).status, 200);
	});
});
