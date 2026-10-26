import assert from "node:assert/strict";
import { test } from "node:test";

test(
	"serves all published pages without PostgreSQL or telemetry services",
	{ timeout: 15000 },
	async () => {
		const origin = "http://website:10000";
		for (const path of [
			"/",
			"/blog",
			"/contact",
			"/blog/my-favorite-software-defect",
		]) {
			const response = await fetch(`${origin}${path}`, {
				signal: AbortSignal.timeout(5000),
			});
			assert.equal(response.status, 200);
			assert.match(await response.text(), /aria-label="Page location"/);
		}
		for (const method of ["GET", "POST"]) {
			const response = await fetch(
				`${origin}/api/page-hits${method === "GET" ? "?path=%2F" : ""}`,
				{
					method,
					headers: {
						"content-type": "application/json",
						"sec-fetch-site": "same-origin",
					},
					body:
						method === "POST"
							? JSON.stringify({
									path: "/",
									operationId: crypto.randomUUID(),
								})
							: undefined,
					signal: AbortSignal.timeout(5000),
				},
			);
			assert.equal(response.status, 503);
		}
		for (const method of ["GET", "POST"]) {
			const subject = "/blog/my-favorite-software-defect";
			const response = await fetch(
				`${origin}/api/feedback${method === "GET" ? `?subject=${encodeURIComponent(subject)}` : ""}`,
				{
					method,
					headers: {
						"content-type": "application/json",
						"sec-fetch-site": "same-origin",
					},
					body:
						method === "POST"
							? JSON.stringify({
									subject,
									reaction: "like",
									operationId: crypto.randomUUID(),
								})
							: undefined,
					signal: AbortSignal.timeout(8000),
				},
			);
			assert.equal(response.status, 503);
		}
		assert.equal((await fetch(`${origin}/api/health`)).status, 200);
	},
);
