import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks, setSourceMapsSupport } from "node:module";
import { suite, test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

setSourceMapsSupport(true);
registerHooks({
	load(url, context, nextLoad) {
		if (url.endsWith("/feedback.tsx"))
			return {
				format: "module",
				shortCircuit: true,
				source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
					fileName: new URL(url).pathname,
					compilerOptions: {
						target: ts.ScriptTarget.ES2022,
						module: ts.ModuleKind.ESNext,
						jsx: ts.JsxEmit.ReactJSX,
						inlineSourceMap: true,
						inlineSources: true,
					},
				}).outputText,
			};
		return nextLoad(url, context);
	},
});
const { Feedback } = await import("../src/components/feedback.tsx");
const subject = "item:example:first";

suite("Feedback component", () => {
	async function mount(
		context: { after: (callback: () => Promise<void>) => void },
		fetcher: typeof fetch,
	) {
		const dom = new JSDOM('<div id="root"></div>');
		const stylesheet = dom.window.document.createElement("style");
		stylesheet.textContent = readFileSync(
			new URL("../src/app/globals.css", import.meta.url),
			"utf8",
		);
		dom.window.document.head.append(stylesheet);
		const previous = {
			window: globalThis.window,
			document: globalThis.document,
			fetch: globalThis.fetch,
		};
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
			Object.assign(globalThis, previous);
		});
		const render = (feedbackSubject = subject, withArticle = true) =>
			act(async () =>
				root.render(
					createElement(
						Feedback,
						{ subject: feedbackSubject },
						withArticle
							? createElement("article", {}, "Article body")
							: undefined,
					),
				),
			);
		await render();
		return { root, container, render };
	}
	function buttons(container: Element, reaction: string) {
		return [
			...container.querySelectorAll<HTMLButtonElement>(
				`button[data-reaction="${reaction}"]`,
			),
		];
	}
	function assertReservedCounts(container: Element) {
		for (const count of container.querySelectorAll(
			".feedback__count, .feedback__score output",
		)) {
			const style =
				count.ownerDocument.defaultView!.getComputedStyle(count);
			const reference = count.cloneNode(false) as HTMLElement;
			reference.style.minWidth =
				count.tagName === "OUTPUT" ? "6ch" : "5ch";
			count.after(reference);
			const reservedWidth =
				reference.ownerDocument.defaultView!.getComputedStyle(
					reference,
				).minWidth;
			reference.remove();
			assert.equal(style.minWidth, reservedWidth);
			assert.equal(style.whiteSpace, "nowrap");
			assert.equal(style.fontVariantNumeric, "tabular-nums");
			assert.equal(style.textAlign, "right");
		}
	}

	test("reserves count space from placeholders through typical values and preserves larger totals", async (context) => {
		let complete!: (response: Response) => void;
		const { container } = await mount(
			context,
			async () =>
				new Promise((resolve) => {
					complete = resolve;
				}),
		);
		assertReservedCounts(container);
		await act(async () =>
			complete(Response.json({ likes: 1234, dislikes: 12 })),
		);
		assertReservedCounts(container);
		assert.equal(
			container.querySelector(".feedback__count")!.textContent,
			"1,234",
		);
		await act(async () => buttons(container, "like")[0].click());
		await act(async () =>
			complete(Response.json({ likes: 123456789, dislikes: 12 })),
		);
		assertReservedCounts(container);
		assert.equal(
			container.querySelector(".feedback__count")!.textContent,
			"123,456,789",
		);
	});

	function assertCompactFeedback(container: Element) {
		for (const bar of container.querySelectorAll(
			'[aria-label="Feedback"]',
		)) {
			const status = bar.querySelector('[role="status"]')!;
			const style =
				status.ownerDocument.defaultView!.getComputedStyle(status);
			assert.equal(style.position, "absolute");
			assert.equal(style.width, "1px");
			assert.equal(style.height, "1px");
			assert.equal(bar.querySelector(":scope > button"), null);
			const visible = bar.cloneNode(true) as Element;
			visible.querySelector('[role="status"]')!.remove();
			assert.doesNotMatch(
				visible.textContent!,
				/Loading feedback|Sending feedback|Feedback unavailable|could not be confirmed/,
			);
		}
	}

	for (const reaction of ["like", "dislike"]) {
		test(`keeps loading and submitting a ${reaction} out of the feedback layout`, async (context) => {
			let complete!: (response: Response) => void;
			const { container } = await mount(
				context,
				async () =>
					new Promise((resolve) => {
						complete = resolve;
					}),
			);
			assertCompactFeedback(container);
			assert.equal(
				container
					.querySelector('[aria-label="Feedback"]')!
					.getAttribute("aria-busy"),
				"true",
			);
			await act(async () =>
				complete(Response.json({ likes: 0, dislikes: 0 })),
			);
			assertCompactFeedback(container);
			await act(async () => buttons(container, reaction)[0].click());
			assertCompactFeedback(container);
			assert.match(container.textContent!, /Sending feedback/);
			assert.equal(
				container.querySelectorAll("button:disabled").length,
				4,
			);
			await act(async () =>
				complete(Response.json({ likes: 1, dislikes: 1 })),
			);
			assertCompactFeedback(container);
		});
	}

	test("renders accessible loading controls above and below the article before storage responds", () => {
		const dom = new JSDOM(
			renderToString(
				createElement(
					Feedback,
					{ subject },
					createElement("article", {}, "Article body"),
				),
			),
		);
		assert.equal(
			dom.window.document.querySelectorAll('[aria-label="Feedback"]')
				.length,
			2,
		);
		assert.equal(
			dom.window.document.querySelectorAll("button:disabled").length,
			4,
		);
		assert.equal(dom.window.document.querySelectorAll("article").length, 1);
		assert.match(dom.window.document.body.textContent!, /Loading feedback/);
	});
	for (const reaction of ["like", "dislike"]) {
		test(`synchronizes both bars after a ${reaction} and prevents rapid duplicate votes`, async (context) => {
			const submissions: Record<string, string>[] = [];
			const { container } = await mount(
				context,
				async (input, options) => {
					assert.equal(
						String(input),
						options?.method === "POST"
							? "/api/feedback"
							: `/api/feedback?subject=${encodeURIComponent(subject)}`,
					);
					if (options?.method === "POST") {
						submissions.push(JSON.parse(String(options.body)));
						return Response.json(
							reaction === "like"
								? { likes: 3, dislikes: 1 }
								: { likes: 2, dislikes: 2 },
						);
					}
					return Response.json({ likes: 2, dislikes: 1 });
				},
			);
			assert.deepEqual(
				[
					...container.querySelectorAll(
						'[aria-label="Net feedback score"]',
					),
				].map((output) => output.textContent),
				["+1", "+1"],
			);
			await act(async () => {
				buttons(container, reaction)[0].click();
				buttons(container, reaction)[1].click();
			});
			assert.equal(submissions.length, 1);
			assert.equal(submissions[0].reaction, reaction);
			assert.equal(submissions[0].subject, subject);
			assert.ok(!Object.hasOwn(submissions[0], "path"));
			assert.equal(
				container.querySelectorAll("button:disabled").length,
				4,
			);
			assert.ok(
				buttons(container, reaction).every(
					(button) => button.getAttribute("aria-pressed") === "true",
				),
			);
			assert.deepEqual(
				[
					...container.querySelectorAll(
						'[aria-label="Net feedback score"]',
					),
				].map((output) => output.textContent),
				reaction === "like" ? ["+2", "+2"] : ["0", "0"],
			);
			assert.equal(
				container.querySelector('[role="status"]')!.textContent,
				"",
			);
		});
	}
	test("retries an uncertain vote with the same identifier and locks out the other choice", async (context) => {
		const submissions: Record<string, string>[] = [];
		const { container } = await mount(context, async (_input, options) => {
			if (options?.method === "POST") {
				submissions.push(JSON.parse(String(options.body)));
				if (submissions.length === 1)
					throw new Error("lost reply after commit");
				return Response.json({ likes: 1, dislikes: 0 });
			}
			return Response.json({ likes: 0, dislikes: 0 });
		});
		await act(async () => buttons(container, "like")[0].click());
		assert.match(container.textContent!, /could not be confirmed/);
		assert.ok(
			buttons(container, "dislike").every((button) => button.disabled),
		);
		assert.ok(
			buttons(container, "like").every((button) => !button.disabled),
		);
		await act(async () => buttons(container, "like")[1].click());
		assert.equal(submissions.length, 2);
		assert.equal(submissions[0].operationId, submissions[1].operationId);
	});
	for (const [name, reply] of [
		[
			"offline",
			() => {
				throw new Error("offline");
			},
		],
		["a service failure", () => new Response(null, { status: 503 })],
		["invalid counts", () => Response.json({ likes: -1, dislikes: 0 })],
		["malformed JSON", () => new Response("invalid")],
	] as const) {
		test(`contains ${name} and permits loading totals again`, async (context) => {
			let recovered = false;
			const { container } = await mount(context, async () =>
				recovered ? Response.json({ likes: 1, dislikes: 3 }) : reply(),
			);
			assert.match(container.textContent!, /Feedback unavailable/);
			assertCompactFeedback(container);
			assert.ok(
				container.querySelector(
					'.feedback__score [aria-label="Retry feedback"]',
				),
			);
			assert.ok(
				buttons(container, "like").every((button) => button.disabled),
			);
			recovered = true;
			await act(async () =>
				container
					.querySelector<HTMLButtonElement>(
						'[aria-label="Retry feedback"]',
					)!
					.click(),
			);
			assert.deepEqual(
				[
					...container.querySelectorAll(
						'[aria-label="Net feedback score"]',
					),
				].map((output) => output.textContent),
				["-2", "-2"],
			);
		});
	}
	for (const invalid of [
		() => new Response(null, { status: 503 }),
		() => Response.json({ likes: 0.5, dislikes: 0 }),
		() => new Response("invalid"),
	]) {
		test("keeps displayed totals when a vote response cannot be confirmed", async (context) => {
			const { container } = await mount(
				context,
				async (_input, options) =>
					options?.method === "POST"
						? invalid()
						: Response.json({ likes: 4, dislikes: 1 }),
			);
			await act(async () => buttons(container, "like")[0].click());
			assert.match(container.textContent!, /could not be confirmed/);
			assertCompactFeedback(container);
			assert.equal(
				container.querySelector('[aria-label="Net feedback score"]')!
					.textContent,
				"+3",
			);
		});
	}
	test("contains identifier failures without sending a vote", async (context) => {
		let writes = 0;
		const { container } = await mount(context, async (_input, options) => {
			if (options?.method === "POST") writes++;
			return Response.json({ likes: 0, dislikes: 0 });
		});
		context.mock.method(crypto, "randomUUID", () => {
			throw new Error("unavailable");
		});
		await act(async () => buttons(container, "like")[0].click());
		assert.equal(writes, 0);
		assert.match(container.textContent!, /could not be confirmed/);
	});
	test("aborts obsolete requests when the subject changes and supports a standalone bar", async (context) => {
		let signal!: AbortSignal;
		const { container, render } = await mount(
			context,
			async (_input, options) => {
				signal = options!.signal!;
				return new Promise((_resolve, reject) =>
					signal.addEventListener(
						"abort",
						() => reject(new DOMException("Aborted", "AbortError")),
						{ once: true },
					),
				);
			},
		);
		const previousSignal = signal;
		globalThis.fetch = async () => Response.json({ likes: 0, dislikes: 0 });
		await render("/contact", false);
		assert.equal(previousSignal.aborted, true);
		assert.equal(
			container.querySelectorAll('[aria-label="Feedback"]').length,
			1,
		);
	});
	test("contains a vote that finishes after its page is unmounted", async (context) => {
		let signal!: AbortSignal;
		let complete!: (response: Response) => void;
		const { root, container } = await mount(
			context,
			async (_input, options) => {
				if (options?.method !== "POST")
					return Response.json({ likes: 0, dislikes: 0 });
				signal = options.signal!;
				return new Promise((resolve) => {
					complete = resolve;
				});
			},
		);
		await act(async () => buttons(container, "like")[0].click());
		await act(async () => root.unmount());
		assert.equal(signal.aborted, true);
		await act(async () =>
			complete(Response.json({ likes: 1, dislikes: 0 })),
		);
	});
});
