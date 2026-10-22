import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { GET } from "../src/app/api/page-hits/route.ts";

suite("Reading page counts", () => {
	test("reads each published ancestor without incrementing, distinguishes zero from unavailable, and contains invalid responses", async (context) => {
		const previous = {
			fetch: globalThis.fetch,
			url: process.env.STORAGE_SERVICE_URL,
			token: process.env.STORAGE_SERVICE_TOKEN,
		};
		context.after(() => {
			globalThis.fetch = previous.fetch;
			for (const [key, value] of [
				["STORAGE_SERVICE_URL", previous.url],
				["STORAGE_SERVICE_TOKEN", previous.token],
			]) {
				if (value === undefined) delete process.env[key!];
				else process.env[key!] = value;
			}
		});
		const request = (path: string) =>
			new Request(
				`https://site.example/api/page-hits?path=${encodeURIComponent(path)}`,
			);
		process.env.STORAGE_SERVICE_URL = "https://storage.example";
		process.env.STORAGE_SERVICE_TOKEN = "secret";
		const calls: Request[] = [];
		globalThis.fetch = async (input, options) => {
			calls.push(new Request(input, options));
			return Response.json({ found: true, value: 12 });
		};
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
		assert.ok(calls.every((call) => call.method === "GET"));
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
		assert.equal(calls.length, 4);
		globalThis.fetch = async () => Response.json({ found: false });
		assert.deepEqual(await (await GET(request("/"))).json(), { count: 0 });
		for (const value of [-1, 1.5, "12", null]) {
			globalThis.fetch = async () =>
				Response.json({ found: true, value });
			assert.equal((await GET(request("/"))).status, 503);
		}
		globalThis.fetch = async () => {
			throw new Error("secret connection details");
		};
		assert.deepEqual(await (await GET(request("/"))).json(), {
			error: "Page count unavailable",
		});
		delete process.env.STORAGE_SERVICE_URL;
		delete process.env.STORAGE_SERVICE_TOKEN;
		assert.equal((await GET(request("/"))).status, 503);
	});
});
