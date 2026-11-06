import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { PageHitsEndpoint } from "../src/app/api/page-hits/page-hits-endpoint.ts";
import { GET as health } from "../src/app/api/health/route.ts";
import { staticPosts } from "../src/app/blog/posts.generated.ts";
import { isPublishedPage } from "../src/app/published-pages.ts";

suite("Website page-count routes", () => {
	test("recognizes only exact published page paths", async () => {
		for (const post of staticPosts) {
			const path = `/blog/${post.getSlug()}`;
			assert.equal(await isPublishedPage(path), true);
			assert.equal(await isPublishedPage(`${path}/extra`), false);
		}
		for (const path of [
			"/blog/no-such-post",
			"/blog/",
			"constructor",
			"__proto__",
		]) {
			assert.equal(await isPublishedPage(path), false);
		}
	});

	test("keeps health checks independent of counters and records only published pages", async () => {
		const adjustments: unknown[] = [];
		const endpoint = new PageHitsEndpoint(
			{
				read: async () => 12,
				adjust: async (...adjustment) => {
					adjustments.push(adjustment);
					return 12;
				},
			},
			isPublishedPage,
		);
		const request = (path: string, origin = "https://website.example") =>
			new Request("https://website.example/api/page-hits", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin,
					host: new URL(origin).host,
				},
				body: JSON.stringify({
					path,
					operationId: crypto.randomUUID(),
				}),
			});

		assert.equal(health().status, 200);
		const [post] = staticPosts;
		for (const path of [
			"/",
			"/blog",
			"/contact",
			`/blog/${post.getSlug()}`,
		]) {
			const response = await endpoint.record(request(path));
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 12 });
		}
		assert.equal(
			(await endpoint.record(request("/not-published"))).status,
			400,
		);
		assert.equal(adjustments.length, 4);

		for (const publicOrigin of [
			"https://zerofourtwo.com",
			"http://localhost:3000",
		])
			assert.equal(
				(await endpoint.record(request("/", publicOrigin))).status,
				200,
			);
	});

	test("logs and contains counter failures without affecting health", async (context) => {
		const errors = context.mock.method(console, "error", () => {});
		const endpoint = new PageHitsEndpoint(
			{
				read: async () => {
					throw new Error("Database unavailable");
				},
				adjust: async () => {
					throw new Error("Database unavailable");
				},
			},
			async () => true,
		);
		const response = await endpoint.record(
			new Request("https://website.example/api/page-hits", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					path: "/",
					operationId: crypto.randomUUID(),
				}),
			}),
		);
		assert.equal(response.status, 503);
		assert.equal(health().status, 200);
		assert.equal(errors.mock.callCount(), 1);
		const record = JSON.parse(errors.mock.calls[0].arguments[0]);
		assert.equal(record.severityText, "ERROR");
		assert.equal(record.severityNumber, 17);
		assert.equal(record.component, "page-count");
		assert.equal(record.operation, "record");
		assert.equal(
			record.body,
			"The page count could not be recorded. Review the error details, verify that PostgreSQL is reachable and initialized, and retry the request.",
		);
		assert.ok(record.error.includes("Database unavailable"));
		assert.equal(
			new Date(record.timestamp).toISOString(),
			record.timestamp,
		);
	});
});
