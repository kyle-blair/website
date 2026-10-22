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
		beforeRender = () => {},
	) {
		const dom = new JSDOM('<div id="root"></div>', {
			url: "https://website.example",
		});
		const storage = dom.window.localStorage;
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
		const render = (
			feedbackSubject: string | null = subject,
			withArticle = true,
		) =>
			act(async () =>
				root.render(
					feedbackSubject === null
						? null
						: createElement(
								Feedback,
								{ subject: feedbackSubject },
								withArticle
									? createElement(
											"article",
											{},
											"Article body",
										)
									: undefined,
							),
				),
			);
		beforeRender();
		await render();
		return { root, container, render, storage };
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
	test("selects both reactions independently and withdraws either selection", async (context) => {
		let likes = 2;
		let dislikes = 1;
		const submissions: {
			reaction: string;
			selected: boolean;
			operationId: string;
		}[] = [];
		const { container } = await mount(context, async (_input, options) => {
			if (options?.method === "POST") {
				const vote = JSON.parse(String(options.body));
				submissions.push(vote);
				if (vote.reaction === "like") likes += vote.selected ? 1 : -1;
				else dislikes += vote.selected ? 1 : -1;
			}
			return Response.json({ likes, dislikes });
		});
		for (const reaction of ["like", "dislike", "like", "dislike", "like"]) {
			await act(async () => buttons(container, reaction)[0].click());
			for (const kind of ["like", "dislike"])
				assert.equal(
					buttons(container, kind)[0].getAttribute("aria-pressed"),
					buttons(container, kind)[1].getAttribute("aria-pressed"),
				);
		}
		assert.deepEqual(
			submissions.map(({ reaction, selected }) => [reaction, selected]),
			[
				["like", true],
				["dislike", true],
				["like", false],
				["dislike", false],
				["like", true],
			],
		);
		assert.equal(
			new Set(submissions.map(({ operationId }) => operationId)).size,
			5,
		);
		assert.ok(
			buttons(container, "like").every(
				(button) =>
					button.getAttribute("aria-pressed") === "true" &&
					!button.disabled,
			),
		);
		assert.ok(
			buttons(container, "dislike").every(
				(button) =>
					button.getAttribute("aria-pressed") === "false" &&
					!button.disabled,
			),
		);
		assert.deepEqual(
			[
				...container.querySelectorAll(
					'[aria-label="Net feedback score"]',
				),
			].map((output) => output.textContent),
			["+2", "+2"],
		);
	});

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
	test("restores both selections after refresh and lets either be withdrawn without adding votes", async (context) => {
		let likes = 0;
		let dislikes = 0;
		const submissions: { reaction: string; selected: boolean }[] = [];
		const { container, render } = await mount(
			context,
			async (_input, options) => {
				if (options?.method === "POST") {
					const submission = JSON.parse(String(options.body));
					submissions.push(submission);
					const amount = submission.selected ? 1 : -1;
					if (submission.reaction === "like") likes += amount;
					else dislikes += amount;
				}
				return Response.json({ likes, dislikes });
			},
		);
		await act(async () => buttons(container, "like")[0].click());
		await act(async () => buttons(container, "dislike")[1].click());
		await render(null);
		await render();
		assert.equal(submissions.length, 2);
		for (const reaction of ["like", "dislike"])
			assert.ok(
				buttons(container, reaction).every(
					(button) => button.getAttribute("aria-pressed") === "true",
				),
			);
		await act(async () => buttons(container, "like")[1].click());
		await render(null);
		await render();
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"false",
		);
		assert.equal(
			buttons(container, "dislike")[0].getAttribute("aria-pressed"),
			"true",
		);
		await act(async () => buttons(container, "dislike")[0].click());
		await render(null);
		await render();
		assert.deepEqual([likes, dislikes], [0, 0]);
		assert.deepEqual(
			submissions.map(({ reaction, selected }) => [reaction, selected]),
			[
				["like", true],
				["dislike", true],
				["like", false],
				["dislike", false],
			],
		);
		assert.ok(
			[
				...buttons(container, "like"),
				...buttons(container, "dislike"),
			].every(
				(button) => button.getAttribute("aria-pressed") === "false",
			),
		);
	});

	for (const withdrawing of [false, true]) {
		test(`restores a pending ${withdrawing ? "withdrawal" : "selection"} across refresh and retries its original identifier`, async (context) => {
			let likes = 0;
			let loseReply = true;
			const committed = new Set<string>();
			const submissions: { operationId: string; selected: boolean }[] =
				[];
			const { container, render } = await mount(
				context,
				async (_input, options) => {
					if (options?.method === "POST") {
						const submission = JSON.parse(String(options.body));
						submissions.push(submission);
						if (!committed.has(submission.operationId)) {
							likes += submission.selected ? 1 : -1;
							committed.add(submission.operationId);
						}
						if (loseReply && submission.selected === !withdrawing) {
							loseReply = false;
							throw new Error("reply lost after commit");
						}
					}
					return Response.json({ likes, dislikes: 0 });
				},
			);
			await act(async () => buttons(container, "like")[0].click());
			if (withdrawing)
				await act(async () => buttons(container, "like")[0].click());
			const pending = submissions.at(-1)!;
			await render(null);
			await render();
			assert.equal(
				buttons(container, "like")[0].getAttribute("aria-pressed"),
				String(withdrawing),
			);
			await act(async () => buttons(container, "like")[1].click());
			assert.equal(submissions.at(-1)!.operationId, pending.operationId);
			assert.equal(likes, withdrawing ? 0 : 1);
			assert.equal(
				buttons(container, "like")[0].getAttribute("aria-pressed"),
				String(!withdrawing),
			);
		});
	}

	test("keeps selections separate for different feedback subjects", async (context) => {
		const { container, render } = await mount(context, async () =>
			Response.json({ likes: 1, dislikes: 0 }),
		);
		await act(async () => buttons(container, "like")[0].click());
		await render("item:example:second");
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"false",
		);
		await render(subject);
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"true",
		);
	});

	test("does not submit a vote when browser storage is blocked", async (context) => {
		let writes = 0;
		const { container } = await mount(
			context,
			async (_input, options) => {
				if (options?.method === "POST") writes++;
				return Response.json({ likes: 2, dislikes: 0 });
			},
			() => {
				Object.defineProperty(window, "localStorage", {
					get() {
						throw new Error("storage blocked");
					},
				});
			},
		);
		await act(async () => buttons(container, "like")[0].click());
		assert.equal(writes, 0);
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"false",
		);
		assertCompactFeedback(container);
	});

	test("recovers a confirmation write failure after refresh without submitting a new operation", async (context) => {
		const operations: string[] = [];
		const { container, render } = await mount(
			context,
			async (_input, options) => {
				if (options?.method === "POST")
					operations.push(
						JSON.parse(String(options.body)).operationId,
					);
				return Response.json({
					likes: operations.length > 0 ? 1 : 0,
					dislikes: 0,
				});
			},
			() => {
				const prototype = Object.getPrototypeOf(window.localStorage);
				const setItem = prototype.setItem;
				let writes = 0;
				context.mock.method(
					prototype,
					"setItem",
					function (this: Storage, key: string, value: string) {
						if (++writes === 2) throw new Error("storage full");
						setItem.call(this, key, value);
					},
				);
			},
		);
		await act(async () => buttons(container, "like")[0].click());
		await render(null);
		await render();
		await act(async () => buttons(container, "like")[1].click());
		assert.equal(operations.length, 2);
		assert.equal(operations[0], operations[1]);
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"true",
		);
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
				0,
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
	for (const reaction of ["like", "dislike"] as const) {
		test(`retries an uncertain ${reaction} with the same identifier without blocking the other choice`, async (context) => {
			const submissions: Record<string, string>[] = [];
			const { container } = await mount(
				context,
				async (_input, options) => {
					if (options?.method === "POST") {
						submissions.push(JSON.parse(String(options.body)));
						if (submissions.length === 1)
							throw new Error("lost reply after commit");
						return Response.json({
							likes: reaction === "like" ? 1 : 0,
							dislikes: reaction === "dislike" ? 1 : 0,
						});
					}
					return Response.json({ likes: 0, dislikes: 0 });
				},
			);
			await act(async () => buttons(container, reaction)[0].click());
			assert.match(container.textContent!, /Feedback unavailable/);
			assert.ok(
				buttons(
					container,
					reaction === "like" ? "dislike" : "like",
				).every((button) => !button.disabled),
			);
			assert.ok(
				buttons(container, reaction).every(
					(button) => !button.disabled,
				),
			);
			assertCompactFeedback(container);
			await act(async () => buttons(container, reaction)[1].click());
			assert.equal(submissions.length, 2);
			assert.equal(
				submissions[0].operationId,
				submissions[1].operationId,
			);
		});
	}
	test("keeps a selection until its withdrawal is confirmed and retries the same withdrawal", async (context) => {
		const submissions: { selected: boolean; operationId: string }[] = [];
		const { container } = await mount(context, async (_input, options) => {
			if (options?.method !== "POST")
				return Response.json({ likes: 0, dislikes: 0 });
			const submission = JSON.parse(String(options.body));
			submissions.push(submission);
			if (submissions.length === 2)
				throw new Error("lost withdrawal reply");
			return Response.json({
				likes: submission.selected ? 1 : 0,
				dislikes: 0,
			});
		});
		await act(async () => buttons(container, "like")[0].click());
		await act(async () => buttons(container, "like")[1].click());
		assert.ok(
			buttons(container, "like").every(
				(button) => button.getAttribute("aria-pressed") === "true",
			),
		);
		assert.equal(
			container.querySelector('[aria-label="Net feedback score"]')!
				.textContent,
			"+1",
		);
		await act(async () => buttons(container, "like")[0].click());
		assert.deepEqual(
			submissions.map(({ selected }) => selected),
			[true, false, false],
		);
		assert.equal(submissions[1].operationId, submissions[2].operationId);
		assert.notEqual(submissions[0].operationId, submissions[1].operationId);
		assert.ok(
			buttons(container, "like").every(
				(button) => button.getAttribute("aria-pressed") === "false",
			),
		);
		assert.equal(
			container.querySelector('[aria-label="Net feedback score"]')!
				.textContent,
			"0",
		);
	});
	test("keeps both reactions reversible after a withdrawal failure and a twenty-second pause", async (context) => {
		let now = Date.now();
		context.mock.method(Date, "now", () => now);
		let likes = 0;
		let dislikes = 0;
		let unavailable = true;
		const committed = new Set<string>();
		const submissions: {
			reaction: string;
			selected: boolean;
			operationId: string;
		}[] = [];
		const { container } = await mount(context, async (_input, options) => {
			if (options?.method === "POST") {
				const submission = JSON.parse(String(options.body));
				submissions.push(submission);
				if (
					!submission.selected &&
					submission.reaction === "like" &&
					unavailable
				)
					return new Response(null, { status: 503 });
				if (!committed.has(submission.operationId)) {
					const amount = submission.selected ? 1 : -1;
					if (submission.reaction === "like") likes += amount;
					else dislikes += amount;
					committed.add(submission.operationId);
				}
			}
			return Response.json({ likes, dislikes });
		});
		await act(async () => buttons(container, "like")[0].click());
		await act(async () => buttons(container, "dislike")[1].click());
		now += 20000;
		await act(async () => buttons(container, "like")[1].click());
		assert.equal(likes, 1);
		assertCompactFeedback(container);
		assert.match(container.textContent!, /Feedback unavailable/);
		assert.equal(container.querySelectorAll("button:disabled").length, 0);
		assert.equal(container.querySelector("button[title]"), null);
		await act(async () => buttons(container, "dislike")[0].click());
		assert.equal(dislikes, 0);
		assert.equal(
			container.querySelector('[role="status"]')!.textContent,
			"",
		);
		assert.equal(
			buttons(container, "dislike")[0].getAttribute("aria-pressed"),
			"false",
		);
		assert.equal(
			buttons(container, "like")[0].getAttribute("aria-pressed"),
			"true",
		);
		unavailable = false;
		await act(async () => buttons(container, "like")[0].click());
		assert.equal(submissions[2].operationId, submissions[4].operationId);
		assert.deepEqual([likes, dislikes], [0, 0]);
		assert.ok(
			[
				...buttons(container, "like"),
				...buttons(container, "dislike"),
			].every(
				(button) =>
					button.getAttribute("aria-pressed") === "false" &&
					!button.disabled,
			),
		);
		assert.equal(
			container.querySelector('[role="status"]')!.textContent,
			"",
		);
		for (const reaction of ["like", "like", "dislike", "dislike"])
			await act(async () => buttons(container, reaction)[0].click());
		assert.deepEqual([likes, dislikes], [0, 0]);
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
			assert.match(container.textContent!, /Feedback unavailable/);
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
		assert.match(container.textContent!, /Feedback unavailable/);
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
