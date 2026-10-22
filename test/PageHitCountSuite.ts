import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { suite, test } from "node:test";
import { createElement, act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith("/page-hit-count.tsx")) {
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
					compilerOptions: {
						jsx: ts.JsxEmit.ReactJSX,
						module: ts.ModuleKind.ESNext,
						target: ts.ScriptTarget.ES2022,
					},
				}).outputText,
			};
		}
		return nextLoad(url, context);
	},
});
const { PageHitCount } = await import("../src/components/page-hit-count.tsx");

suite("Page hit count", () => {
	async function mount(
		context: { after: (callback: () => Promise<void>) => void },
		fetcher: typeof fetch,
		strict = false,
		beforeRender = () => {},
	) {
		const dom = new JSDOM("<!doctype html><div id='root'></div>", {
			url: "https://website.example",
		});
		const previousFetch = globalThis.fetch;
		const previousWindow = globalThis.window;
		const previousDocument = globalThis.document;
		Object.assign(globalThis, {
			window: dom.window,
			document: dom.window.document,
			fetch: fetcher,
			IS_REACT_ACT_ENVIRONMENT: true,
		});
		const container = dom.window.document.getElementById("root")!;
		const root = createRoot(container);
		const storage = dom.window.localStorage;
		Object.defineProperty(dom.window.navigator, "locks", {
			configurable: true,
			value: globalThis.navigator.locks,
		});
		context.after(async () => {
			await act(async () => root.unmount());
			dom.window.close();
			Object.assign(globalThis, {
				window: previousWindow,
				document: previousDocument,
				fetch: previousFetch,
			});
		});
		beforeRender();
		const render = (path: string | null = "/") =>
			act(async () =>
				root.render(
					path === null
						? null
						: strict
							? createElement(
									StrictMode,
									{},
									createElement(PageHitCount, { path }),
								)
							: createElement(PageHitCount, { path }),
				),
			);
		await render();
		return { root, container, render, storage };
	}

	test("renders page markup and a loading indication before any request finishes", async (context) => {
		const markup = renderToString(
			createElement(PageHitCount, { path: "/" }),
		);
		assert.match(markup, /Loading page views/);
		let complete!: (value: Response) => void;
		const pending = new Promise<Response>((resolve) => {
			complete = resolve;
		});
		const requests: RequestInit[] = [];
		const { container } = await mount(context, async (_input, options) => {
			requests.push(options!);
			return pending;
		});
		assert.equal(container.textContent, "views: ?");
		assert.equal(
			container.querySelector("output")!.getAttribute("aria-busy"),
			"true",
		);
		await act(async () => complete(Response.json({ count: 1234 })));
		assert.match(container.textContent!, /views: 1,234/);
		assert.equal(
			container.querySelector("output")!.getAttribute("aria-busy"),
			"false",
		);
		assert.equal(requests[0].method, "POST");
		assert.equal(JSON.parse(requests[0].body as string).path, "/");
	});

	test("counts once during React strict-effect replay", async (context) => {
		const operations: string[] = [];
		const { container } = await mount(
			context,
			async (_input, options) => {
				operations.push(
					JSON.parse(options!.body as string).operationId,
				);
				return Response.json({ count: 1 });
			},
			true,
		);
		assert.equal(operations.length, 1);
		assert.match(container.textContent!, /1/);
	});

	for (const [name, reply] of [
		["zero", () => Response.json({ count: 0 })],
		["a string count", () => Response.json({ count: "2" })],
		["a negative count", () => Response.json({ count: -1 })],
		["a fractional count", () => Response.json({ count: 1.5 })],
		["a service failure", () => new Response(null, { status: 503 })],
		["invalid JSON", () => new Response("not json")],
	] as const) {
		test(`handles ${name} without blocking the page`, async (context) => {
			const { container } = await mount(context, async () => reply());
			assert.match(
				container.textContent!,
				name === "zero" ? /views: 0/ : /\?/,
			);
		});
	}

	for (const failure of ["missing", "throwing"]) {
		test(`contains ${failure} operation identifier generation`, async (context) => {
			let requests = 0;
			const { container } = await mount(
				context,
				async () => {
					requests += 1;
					return Response.json({ count: 1 });
				},
				false,
				() => {
					context.mock.property(
						Object.getPrototypeOf(crypto) as {
							randomUUID?: () => string;
						},
						"randomUUID",
						failure === "missing"
							? undefined
							: () => {
									throw new Error(
										"Identifier generation failed",
									);
								},
					);
				},
			);
			assert.equal(container.textContent, "views: 1");
			assert.equal(requests, 1);
		});
	}

	test("contains network failures", async (context) => {
		const { container } = await mount(context, async () => {
			throw new Error("network unavailable");
		});
		assert.equal(container.textContent, "views: ?");
		assert.ok(
			container.querySelector('[aria-label="Page views unavailable"]'),
		);
	});

	test("reads fresh totals on repeat visits and counts again at ten minutes without extending the window", async (context) => {
		let now = 1800000000000;
		context.mock.method(Date, "now", () => now);
		let count = 0;
		const requests: Request[] = [];
		const { container, render, storage } = await mount(
			context,
			async (input, options) => {
				const request = new Request(
					new URL(String(input), "https://website.example"),
					options,
				);
				requests.push(request);
				if (request.method === "POST") count++;
				return Response.json({ count });
			},
		);
		const first = JSON.parse(await requests[0].text());
		assert.equal(storage.length, 1);
		const saved = storage.getItem(storage.key(0)!);
		count = 7;
		now += 9 * 60 * 1000;
		await render(null);
		await render();
		assert.equal(requests[1].method, "GET");
		assert.equal(new URL(requests[1].url).searchParams.get("path"), "/");
		assert.equal(container.textContent, "views: 7");
		assert.equal(storage.getItem(storage.key(0)!), saved);
		now += 60 * 1000;
		await render(null);
		await render();
		assert.equal(requests[2].method, "POST");
		const next = JSON.parse(await requests[2].text());
		assert.notEqual(first.operationId, next.operationId);
		assert.equal(container.textContent, "views: 8");
	});

	test("keeps independent visit records for each page when the path changes", async (context) => {
		const requests: Request[] = [];
		const { render, storage } = await mount(
			context,
			async (input, options) => {
				requests.push(
					new Request(
						new URL(String(input), "https://website.example"),
						options,
					),
				);
				return Response.json({ count: 2 });
			},
		);
		await render("/blog");
		await render("/");
		assert.deepEqual(
			requests.map((request) => request.method),
			["POST", "POST", "GET"],
		);
		const first = await requests[0].json();
		const second = await requests[1].json();
		assert.deepEqual([first.path, second.path], ["/", "/blog"]);
		assert.notEqual(first.operationId, second.operationId);
		assert.equal(storage.length, 2);
	});

	test("reuses an uncertain operation after remounting and reads totals after confirmation", async (context) => {
		const operations: string[] = [];
		const methods: string[] = [];
		const { container, render } = await mount(
			context,
			async (_input, options) => {
				methods.push(options!.method!);
				if (options!.method === "POST") {
					operations.push(
						JSON.parse(String(options!.body)).operationId,
					);
					if (operations.length === 1)
						throw new Error("reply lost after commit");
				}
				return Response.json({ count: 1 });
			},
		);
		assert.equal(container.textContent, "views: ?");
		await render(null);
		await render();
		assert.equal(container.textContent, "views: 1");
		await render(null);
		await render();
		assert.deepEqual(methods, ["POST", "POST", "GET"]);
		assert.equal(operations[0], operations[1]);
	});

	for (const failure of ["access", "read", "write", "cleanup", "locks"]) {
		test(`reads totals without incrementing when browser ${failure} is unavailable`, async (context) => {
			const methods: string[] = [];
			const { container } = await mount(
				context,
				async (_input, options) => {
					methods.push(options!.method!);
					return Response.json({ count: 4 });
				},
				false,
				() => {
					const fail = () => {
						throw new Error("browser storage blocked");
					};
					if (failure === "access")
						Object.defineProperty(window, "localStorage", {
							get: fail,
						});
					else if (failure === "locks")
						Object.defineProperty(window.navigator, "locks", {
							value: undefined,
						});
					else {
						const storage = window.localStorage;
						const method =
							failure === "read"
								? "getItem"
								: failure === "write"
									? "setItem"
									: "removeItem";
						storage.setItem("page-visit:stale", "invalid");
						context.mock.method(
							Object.getPrototypeOf(storage),
							method,
							fail,
						);
					}
				},
			);
			assert.deepEqual(methods, ["GET"]);
			assert.equal(container.textContent, "views: 4");
		});
	}

	test("keeps the operation retryable if storing its confirmation fails", async (context) => {
		const operations: string[] = [];
		const { container, render } = await mount(
			context,
			async (_input, options) => {
				operations.push(JSON.parse(String(options!.body)).operationId);
				return Response.json({ count: 1 });
			},
			false,
			() => {
				const prototype = Object.getPrototypeOf(window.localStorage);
				const setItem = prototype.setItem;
				let writes = 0;
				context.mock.method(
					prototype,
					"setItem",
					function (this: Storage, key: string, value: string) {
						if (++writes === 2)
							throw new Error("storage became full");
						setItem.call(this, key, value);
					},
				);
			},
		);
		assert.equal(container.textContent, "views: 1");
		await render(null);
		await render();
		assert.equal(operations.length, 2);
		assert.equal(operations[0], operations[1]);
	});

	const validVisit = {
		operationId: "42c26729-670f-4c77-b218-dfb0820ad912",
		createdAt: 1800000000000,
		confirmed: true,
	};
	for (const [name, value] of [
		["malformed", "not json"],
		["null", "null"],
		[
			"missing identifier",
			JSON.stringify({ ...validVisit, operationId: undefined }),
		],
		[
			"invalid identifier",
			JSON.stringify({ ...validVisit, operationId: "invalid" }),
		],
		[
			"missing timestamp",
			JSON.stringify({ ...validVisit, createdAt: undefined }),
		],
		[
			"future timestamp",
			JSON.stringify({
				...validVisit,
				createdAt: validVisit.createdAt + 1,
			}),
		],
		[
			"expired timestamp",
			JSON.stringify({
				...validVisit,
				createdAt: validVisit.createdAt - 600000,
			}),
		],
		[
			"invalid confirmation",
			JSON.stringify({ ...validVisit, confirmed: "true" }),
		],
	]) {
		test(`replaces a ${name} visit record without touching unrelated browser data`, async (context) => {
			context.mock.method(Date, "now", () => validVisit.createdAt);
			const methods: string[] = [];
			const { storage } = await mount(
				context,
				async (_input, options) => {
					methods.push(options!.method!);
					return Response.json({ count: 1 });
				},
				false,
				() => {
					window.localStorage.setItem("page-visit:/", value);
					window.localStorage.setItem("page-visit:/old", value);
					window.localStorage.setItem("other-setting", "preserved");
				},
			);
			assert.deepEqual(methods, ["POST"]);
			assert.equal(storage.getItem("page-visit:/old"), null);
			assert.equal(storage.getItem("other-setting"), "preserved");
			assert.equal(storage.length, 2);
		});
	}

	test("coordinates independent simultaneous visits through the shared browser lock", async (context) => {
		const requests: Request[] = [];
		const { render } = await mount(context, async (input, options) => {
			requests.push(
				new Request(
					new URL(String(input), "https://website.example"),
					options,
				),
			);
			return Response.json({ count: 1 });
		});
		await render(null);
		requests.length = 0;
		const { readPageHitCount } =
			await import("../src/infrastructure/browser-page-hits.ts");
		assert.deepEqual(
			await Promise.all([
				readPageHitCount("/blog", new AbortController().signal),
				readPageHitCount("/blog", new AbortController().signal),
			]),
			[1, 1],
		);
		assert.deepEqual(
			requests.map((request) => request.method),
			["POST", "GET"],
		);
	});

	test("aborts requests when unmounted", async (context) => {
		let signal!: AbortSignal;
		const pending = await mount(context, async (_input, options) => {
			signal = options!.signal!;
			return new Promise((_resolve, reject) =>
				signal.addEventListener(
					"abort",
					() => reject(new DOMException("Aborted", "AbortError")),
					{ once: true },
				),
			);
		});
		await act(async () => pending.root.unmount());
		assert.equal(signal.aborted, true);
	});
});
