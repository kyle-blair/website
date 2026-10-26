import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { PageHitsEndpoint } from "../src/app/api/page-hits/page-hits-endpoint.ts";
import { isPublishedPage } from "../src/app/published-pages.ts";

suite("Reading page counts", () => {
	test("reads each published ancestor without incrementing, distinguishes zero from unavailable, and contains invalid responses", async () => {
		const request = (path: string) =>
			new Request(
				`https://site.example/api/page-hits?path=${encodeURIComponent(path)}`,
			);
		let calls = 0;
		let storedValue: unknown = 12;
		let unavailable = false;
		const endpoint = new PageHitsEndpoint(
			{
				read: async () => {
					calls += 1;
					if (unavailable) throw new Error("Database unavailable");
					return storedValue as number;
				},
				adjust: async () => {
					throw new Error("A read must not adjust a counter.");
				},
			},
			isPublishedPage,
		);
		const GET = (request: Request) => endpoint.read(request);
		for (const path of [
			"/",
			"/blog",
			"/contact",
			"/blog/my-favorite-software-defect",
		]) {
			const response = await GET(request(path));
			assert.equal(response.status, 200);
			assert.equal(
				response.headers.get("cache-control"),
				"private, no-store",
			);
			assert.deepEqual(await response.json(), { count: 12 });
		}
		assert.equal(calls, 4);
		for (const path of [
			"/not-published",
			"/?person=secret",
			"/blog/%",
			"x".repeat(501),
			"x".repeat(5000),
		])
			assert.equal((await GET(request(path))).status, 400);
		assert.equal(
			(await GET(new Request("https://site.example/api/page-hits")))
				.status,
			400,
		);
		assert.equal(calls, 4);
		storedValue = 0;
		assert.deepEqual(await (await GET(request("/"))).json(), { count: 0 });
		for (const value of [-1, 1.5, "12", null]) {
			storedValue = value;
			assert.equal((await GET(request("/"))).status, 503);
		}
		unavailable = true;
		assert.deepEqual(await (await GET(request("/"))).json(), {
			error: "Page count unavailable",
		});
	});
});
