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
		await act(async () =>
			root.render(
				strict
					? createElement(
							StrictMode,
							{},
							createElement(PageHitCount, { path: "/" }),
						)
					: createElement(PageHitCount, { path: "/" }),
			),
		);
		return { root, container };
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

	test("uses the same operation identifier during React strict-effect replay", async (context) => {
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
		assert.equal(operations.length, 2);
		assert.equal(operations[0], operations[1]);
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
			assert.equal(container.textContent, "views: ?");
			assert.equal(requests, 0);
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
