import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { POST } from "../src/app/api/page-hits/route.ts";
import { GET } from "../src/app/api/health/route.ts";
import { getPosts } from "../src/app/blog/posts.ts";

suite("Website page-count routes", () => {
	test("keeps health checks independent of storage and returns counts only for published pages", async (context) => {
		const originalFetch = globalThis.fetch;
		const originalEnvironment = {
			url: process.env.STORAGE_SERVICE_URL,
			token: process.env.STORAGE_SERVICE_TOKEN,
			allowHttp: process.env.STORAGE_ALLOW_HTTP,
		};
		context.after(() => {
			globalThis.fetch = originalFetch;
			for (const [key, value] of [
				["STORAGE_SERVICE_URL", originalEnvironment.url],
				["STORAGE_SERVICE_TOKEN", originalEnvironment.token],
				["STORAGE_ALLOW_HTTP", originalEnvironment.allowHttp],
			]) {
				if (value === undefined) delete process.env[key!];
				else process.env[key!] = value;
			}
		});
		const request = (path: string) =>
			new Request("https://website.example/api/page-hits", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					path,
					operationId: crypto.randomUUID(),
				}),
			});
		delete process.env.STORAGE_SERVICE_URL;
		delete process.env.STORAGE_SERVICE_TOKEN;
		delete process.env.STORAGE_ALLOW_HTTP;
		assert.equal(GET().status, 200);
		assert.equal((await POST(request("/"))).status, 503);
		process.env.STORAGE_SERVICE_URL = "https://storage.example";
		process.env.STORAGE_SERVICE_TOKEN = "secret";
		globalThis.fetch = async () => Response.json({ value: 12 });
		const [post] = await getPosts();
		for (const path of ["/", "/blog", "/contact", `/blog/${post.slug}`]) {
			const response = await POST(request(path));
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: 12 });
		}
		assert.equal((await POST(request("/not-published"))).status, 400);
		process.env.STORAGE_SERVICE_URL = "http://storage:10000";
		assert.equal((await POST(request("/"))).status, 503);
		process.env.STORAGE_ALLOW_HTTP = "true";
		assert.equal((await POST(request("/"))).status, 200);
		for (const publicOrigin of [
			"https://zerofourtwo.com",
			"http://localhost:3000",
		]) {
			const proxied = new Request("https://0.0.0.0:10000/api/page-hits", {
				method: "POST",
				headers: {
					origin: publicOrigin,
					host: new URL(publicOrigin).host,
					"content-type": "application/json",
				},
				body: JSON.stringify({
					path: "/",
					operationId: crypto.randomUUID(),
				}),
			});
			assert.equal((await POST(proxied)).status, 200);
		}
		const local = new Request("http://0.0.0.0:10000/api/page-hits", {
			method: "POST",
			headers: {
				origin: "http://localhost:3000",
				host: "localhost:3000",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				path: "/",
				operationId: crypto.randomUUID(),
			}),
		});
		assert.equal((await POST(local)).status, 200);
	});
});
