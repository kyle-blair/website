import assert from "node:assert/strict";
import { suite, test } from "node:test";

const origin = new URL("http://website:10000");

async function pageCount(path: string): Promise<number> {
	const response = await fetch(
		new URL(`/api/page-hits?path=${encodeURIComponent(path)}`, origin),
	);
	assert.equal(response.status, 200);
	return (await response.json()).count;
}

async function feedbackTotals(subject: string) {
	const response = await fetch(
		new URL(`/api/feedback?subject=${encodeURIComponent(subject)}`, origin),
	);
	assert.equal(response.status, 200);
	return (await response.json()) as { likes: number; dislikes: number };
}

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

suite("Website and PostgreSQL containers", { timeout: 30000 }, () => {
	test("renders matching header and footer navigation with the address stream outside both", async () => {
		const response = await fetch(origin, {
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(response.status, 200);
		const html = await response.text();
		const header = html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1];
		const footer = html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1];
		assert.ok(header);
		assert.ok(footer);
		const links = (markup: string) =>
			[...markup.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(
				(match) => match[1],
			);
		assert.deepEqual(links(header), links(footer));
		assert.ok(links(header).includes("/blog"));
		assert.ok(links(header).includes("/contact"));
		assert.match(header, /aria-label="Primary navigation"/);
		assert.match(footer, /aria-label="Footer navigation"/);
		assert.doesNotMatch(header + footer, /network-address-stream/);
		assert.match(
			html,
			/<\/main>\s*<aside\b[^>]*class="network-address-stream"/,
		);
	});

	test("serves page markup with a loading counter before recording a view", async () => {
		const before = await pageCount("/");
		const response = await fetch(origin, {
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(response.status, 200);
		const html = await response.text();
		const stylesheet = html.match(/href="([^"]+\.css(?:\?[^"]*)?)"/);
		assert.ok(stylesheet, "The standalone page must include a stylesheet");
		const styles = await fetch(new URL(stylesheet[1], origin));
		assert.equal(styles.status, 200);
		assert.match(styles.headers.get("content-type") ?? "", /text\/css/);
		assert.match(html, /<main[\s>]/);
		assert.match(
			html,
			/<main\b[^>]*>\s*<nav\b[^>]*aria-label="Page location"/,
		);
		assert.match(html, /aria-label="Loading page views"/);
		assert.equal(
			[...html.matchAll(/aria-label="Loading page views"/g)].length,
			1,
		);
		assert.equal(html.includes("postgresql://"), false);
		assert.equal(await pageCount("/"), before);
	});

	test("accepts the configured browser origin and persists page counts", async () => {
		for (const path of ["/", "/blog", "/contact"]) {
			const before = await pageCount(path);
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
			assert.equal(await pageCount(path), before + 1);
		}
	});

	test("serializes concurrent adjustments and deduplicates concurrent retries", async () => {
		const path = "/contact";
		const before = await pageCount(path);
		const operationId = crypto.randomUUID();
		const retries = await Promise.all(
			Array.from({ length: 20 }, () => pageView(path, operationId)),
		);
		for (const response of retries) {
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: before + 1 });
		}

		const adjustments = await Promise.all(
			Array.from({ length: 20 }, () => pageView(path)),
		);
		assert.deepEqual(
			adjustments.map((response) => response.status),
			Array(20).fill(200),
		);
		assert.equal(await pageCount(path), before + 21);
	});

	test("rejects cross-site requests without changing stored counts", async () => {
		const before = await pageCount("/");
		const response = await pageView(
			"/",
			crypto.randomUUID(),
			"https://example.invalid",
		);
		assert.equal(response.status, 403);
		assert.equal(await pageCount("/"), before);
	});

	test("rejects oversized bodies with and without a content length without recording a view", async () => {
		const before = await pageCount("/");
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
		assert.equal(await pageCount("/"), before);
	});

	test("rejects malformed paths while the website remains responsive", async () => {
		const response = await pageView(`/${"a".repeat(64)}!`);
		assert.equal(response.status, 400);
		const health = await fetch(new URL("/api/health", origin), {
			signal: AbortSignal.timeout(5000),
		});
		assert.equal(health.status, 200);
	});

	test("reads ancestor counts without recording additional visits", async () => {
		for (const path of ["/", "/blog"]) {
			const before = await pageCount(path);
			const response = await fetch(
				new URL(
					`/api/page-hits?path=${encodeURIComponent(path)}`,
					origin,
				),
				{ signal: AbortSignal.timeout(5000) },
			);
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { count: before });
			assert.equal(await pageCount(path), before);
		}
	});

	test("renders reusable feedback controls above and below each blog post", async () => {
		const response = await fetch(
			new URL("/blog/my-favorite-software-defect", origin),
		);
		assert.equal(response.status, 200);
		const html = await response.text();
		assert.match(
			html,
			/<time\b[^>]*datetime="(\d{4}-\d{2}-\d{2})"[^>]*>\1<\/time>/i,
		);
		assert.equal([...html.matchAll(/aria-label="Feedback"/g)].length, 2);
		assert.equal([...html.matchAll(/aria-label="Like"/g)].length, 2);
		assert.equal([...html.matchAll(/aria-label="Dislike"/g)].length, 2);
	});

	for (const subject of [
		"/blog/my-favorite-software-defect",
		"item:example:first",
		"item:example:second",
	]) {
		test("persists anonymous feedback and deduplicates retries", async () => {
			const { likes, dislikes } = await feedbackTotals(subject);
			const get = () =>
				fetch(
					new URL(
						`/api/feedback?subject=${encodeURIComponent(subject)}`,
						origin,
					),
				);
			const before = await get();
			assert.equal(before.status, 200);
			assert.deepEqual(await before.json(), { likes, dislikes });
			const operationId = crypto.randomUUID();
			for (const identifier of [operationId, operationId.toUpperCase()]) {
				const response = await fetch(new URL("/api/feedback", origin), {
					method: "POST",
					headers: {
						"content-type": "application/json",
						"sec-fetch-site": "same-origin",
					},
					body: JSON.stringify({
						subject,
						reaction: "like",
						operationId: identifier,
					}),
				});
				assert.equal(response.status, 200);
				assert.equal(
					response.headers.get("cache-control"),
					"private, no-store",
				);
				assert.deepEqual(await response.json(), {
					likes: likes + 1,
					dislikes,
				});
			}
			const response = await fetch(new URL("/api/feedback", origin), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"sec-fetch-site": "same-origin",
				},
				body: JSON.stringify({
					subject,
					reaction: "dislike",
					operationId: crypto.randomUUID(),
				}),
			});
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), {
				likes: likes + 1,
				dislikes: dislikes + 1,
			});
			const rejected = await fetch(new URL("/api/feedback", origin), {
				method: "POST",
				headers: {
					"content-type": "application/json",
					"sec-fetch-site": "cross-site",
				},
				body: JSON.stringify({
					subject,
					reaction: "like",
					operationId: crypto.randomUUID(),
				}),
			});
			assert.equal(rejected.status, 403);
			assert.deepEqual(await feedbackTotals(subject), {
				likes: likes + 1,
				dislikes: dislikes + 1,
			});
			for (const reaction of ["like", "dislike"]) {
				const withdrawalId = crypto.randomUUID();
				for (const identifier of [
					withdrawalId,
					withdrawalId.toUpperCase(),
				]) {
					const withdrawal = await fetch(
						new URL("/api/feedback", origin),
						{
							method: "POST",
							headers: {
								"content-type": "application/json",
								"sec-fetch-site": "same-origin",
							},
							body: JSON.stringify({
								subject,
								reaction,
								selected: false,
								operationId: identifier,
							}),
						},
					);
					assert.equal(withdrawal.status, 200);
					assert.deepEqual(await withdrawal.json(), {
						likes,
						dislikes: dislikes + (reaction === "like" ? 1 : 0),
					});
				}
			}
			assert.deepEqual(await feedbackTotals(subject), {
				likes,
				dislikes,
			});
		});
	}
});
