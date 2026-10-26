import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { FeedbackEndpoint } from "../src/app/api/feedback/feedback-endpoint.ts";

suite("Feedback routes", () => {
	test("reads and records anonymous item feedback, rejecting invalid submissions before storage", async () => {
		const counts = new Map<string, number>();
		const operations = new Map<
			string,
			{ key: string; amount: number; value: number }
		>();
		let calls = 0;
		let unavailable = false;
		const endpoint = new FeedbackEndpoint({
			read: async (key) => {
				calls += 1;
				if (unavailable) throw new Error("Database unavailable");
				return counts.get(key) ?? 0;
			},
			adjust: async (key, operationId, amount) => {
				calls += 1;
				if (unavailable) throw new Error("Database unavailable");
				const normalized = operationId.toLowerCase();
				const previous = operations.get(normalized);
				if (previous) {
					if (previous.key !== key || previous.amount !== amount)
						throw new Error("Conflicting operation");
					return previous.value;
				}
				const value = (counts.get(key) ?? 0) + amount;
				counts.set(key, value);
				operations.set(normalized, { key, amount, value });
				return value;
			},
		});
		const GET = (request: Request) => endpoint.read(request);
		const POST = (request: Request) => endpoint.record(request);
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
		const before = calls;
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
		assert.equal(calls, before);
		unavailable = true;
		assert.deepEqual(await (await get(subject)).json(), {
			error: "Feedback unavailable",
		});
		assert.equal(
			(await post({ subject, reaction: "like", operationId })).status,
			503,
		);
	});
});
