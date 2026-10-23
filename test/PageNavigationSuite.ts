import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { suite, test } from "node:test";
import { createElement, act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/link" || specifier === "next/navigation")
			return {
				url: `${new URL(`../node_modules/${specifier}.js`, import.meta.url).href}`,
				shortCircuit: true,
			};
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		if (url.includes("next/navigation"))
			return {
				format: "module",
				shortCircuit: true,
				source: "export function usePathname() { return globalThis.navigationPath; }",
			};
		if (url.includes("next/link"))
			return {
				format: "module",
				shortCircuit: true,
				source: 'import {createElement} from "react"; export default function Link(props) { return createElement("a", props); }',
			};
		return nextLoad(url, context);
	},
});
const { PageNavigation } =
	await import("../src/components/page-navigation.tsx");
const pages = [
	{ path: "/", title: "home" },
	{ path: "/blog", title: "blog" },
	{
		path: "/blog/my-favorite-software-defect",
		title: "My Favorite Software Defect",
	},
	{ path: "/contact", title: "contact" },
];

suite("Page navigation", () => {
	test("keeps the path on one line, truncates the current title, and aligns view text on a shared baseline", () => {
		Object.assign(globalThis, { navigationPath: pages[2].path });
		const dom = new JSDOM(
			renderToString(createElement(PageNavigation, { pages })),
		);
		const stylesheet = dom.window.document.createElement("style");
		stylesheet.textContent = readFileSync(
			new URL("../src/app/globals.css", import.meta.url),
			"utf8",
		);
		dom.window.document.head.append(stylesheet);
		const document = dom.window.document;
		const computed = (selector: string) =>
			dom.window.getComputedStyle(document.querySelector(selector)!);
		try {
			assert.equal(computed(".page-navigation ol").flexWrap, "nowrap");
			assert.equal(computed(".page-navigation li").flexShrink, "0");
			assert.equal(
				computed(".page-navigation li:last-child").flexShrink,
				"1",
			);
			const title = computed(
				'[aria-current="page"] .page-navigation__title',
			);
			assert.equal(title.whiteSpace, "nowrap");
			assert.equal(title.overflow, "hidden");
			assert.equal(title.textOverflow, "ellipsis");
			assert.equal(
				computed(".page-navigation__entry").alignItems,
				"baseline",
			);
			const count = computed(".page-navigation .page-hit-count");
			assert.equal(count.display, "inline-flex");
			assert.equal(count.alignItems, "baseline");
			assert.equal(
				count.fontSize,
				computed(".page-navigation__entry").fontSize,
			);
			assert.equal(
				count.lineHeight,
				computed(".page-navigation__entry").lineHeight,
			);
			assert.equal(computed(".page-hit-count output").display, "block");
		} finally {
			dom.window.close();
		}
	});
	test("reserves breadcrumb count space for placeholders, values, and unavailable status", () => {
		Object.assign(globalThis, { navigationPath: pages[2].path });
		const dom = new JSDOM(
			renderToString(createElement(PageNavigation, { pages })),
		);
		const stylesheet = dom.window.document.createElement("style");
		stylesheet.textContent = readFileSync(
			new URL("../src/app/globals.css", import.meta.url),
			"utf8",
		);
		dom.window.document.head.append(stylesheet);
		try {
			for (const output of dom.window.document.querySelectorAll(
				"output",
			)) {
				const reference = output.cloneNode(false) as HTMLOutputElement;
				reference.style.minWidth = "3ch";
				output.after(reference);
				const reservedWidth =
					dom.window.getComputedStyle(reference).minWidth;
				reference.remove();
				for (const content of [
					output.textContent!,
					"0",
					"1,234",
					"?",
					"123,456,789,012",
				]) {
					output.textContent = content;
					const style = dom.window.getComputedStyle(output);
					assert.equal(style.minWidth, reservedWidth);
					assert.equal(style.whiteSpace, "nowrap");
					assert.equal(style.fontVariantNumeric, "tabular-nums");
					assert.equal(style.textAlign, "right");
					assert.equal(output.textContent, content);
				}
			}
		} finally {
			dom.window.close();
		}
	});

	test("names every breadcrumb link and shows views only on the current page", () => {
		Object.assign(globalThis, { navigationPath: pages[2].path });
		const markup = renderToString(createElement(PageNavigation, { pages }));
		const document = new JSDOM(markup).window.document;
		assert.equal(
			document.querySelector("nav")!.getAttribute("aria-label"),
			"Page location",
		);
		const links = [...document.querySelectorAll("a")];
		assert.deepEqual(
			links.map((link) => [
				link.getAttribute("href"),
				link.getAttribute("aria-label"),
			]),
			pages.slice(0, 3).map((page) => [page.path, page.title]),
		);
		for (const [index, link] of links.entries()) {
			assert.equal(
				link.querySelector(".page-navigation__title")!.textContent,
				pages[index].title,
			);
			assert.equal(
				link.querySelectorAll(".page-hit-count output").length,
				index === 2 ? 1 : 0,
			);
		}
		assert.equal(
			document
				.querySelector('[aria-current="page"]')!
				.getAttribute("aria-label"),
			pages[2].title,
		);
		assert.equal(document.querySelectorAll("output").length, 1);
	});
	test("counts and displays only the current page, and resets on navigation while containing outages", async (context) => {
		const dom = new JSDOM('<div id="root"></div>', {
			url: "https://website.example",
		});
		Object.defineProperty(dom.window.navigator, "locks", {
			value: globalThis.navigator.locks,
		});
		const previous = {
			window: globalThis.window,
			document: globalThis.document,
			fetch: globalThis.fetch,
		};
		Object.assign(globalThis, {
			window: dom.window,
			document: dom.window.document,
			IS_REACT_ACT_ENVIRONMENT: true,
			navigationPath: pages[2].path,
		});
		const requests: {
			url: string;
			method: string;
			body: Record<string, string>;
		}[] = [];
		globalThis.fetch = async (input, options) => {
			const method = options?.method ?? "GET";
			requests.push({
				url: String(input),
				method,
				body: options?.body ? JSON.parse(String(options.body)) : {},
			});
			return Response.json({ count: method === "POST" ? 3 : 12 });
		};
		const root = createRoot(dom.window.document.getElementById("root")!);
		context.after(async () => {
			await act(async () => root.unmount());
			Object.assign(globalThis, previous);
			dom.window.close();
		});
		await act(async () =>
			root.render(
				createElement(
					StrictMode,
					{},
					createElement(PageNavigation, { pages }),
				),
			),
		);
		assert.equal(
			requests.filter((request) => request.method === "POST").length,
			1,
		);
		assert.equal(
			new Set(
				requests
					.filter((request) => request.method === "POST")
					.map((request) => request.body.operationId),
			).size,
			1,
		);
		assert.ok(
			requests
				.filter((request) => request.method === "POST")
				.every((request) => request.body.path === pages[2].path),
		);
		assert.equal(
			requests.filter((request) => request.method === "GET").length,
			0,
		);
		assert.deepEqual(
			[...dom.window.document.querySelectorAll("output")].map(
				(output) => output.textContent,
			),
			["3"],
		);
		Object.assign(globalThis, { navigationPath: "/contact" });
		globalThis.fetch = async () => {
			throw new Error("offline");
		};
		await act(async () =>
			root.render(createElement(PageNavigation, { pages })),
		);
		assert.equal(dom.window.document.querySelectorAll("a").length, 2);
		assert.equal(
			dom.window.document
				.querySelector('[aria-current="page"]')!
				.getAttribute("href"),
			"/contact",
		);
		assert.equal(dom.window.document.querySelectorAll("output").length, 1);
		assert.equal(
			dom.window.document.querySelectorAll("output")[0].textContent,
			"?",
		);
		Object.assign(globalThis, { navigationPath: "/unknown" });
		await act(async () =>
			root.render(createElement(PageNavigation, { pages })),
		);
		assert.equal(dom.window.document.querySelectorAll("a").length, 1);
	});
	test("shows home as the current page at the root", () => {
		Object.assign(globalThis, { navigationPath: "/" });
		const markup = renderToString(createElement(PageNavigation, { pages }));
		assert.match(markup, /aria-current="page"/);
		assert.equal(
			new JSDOM(markup).window.document.querySelectorAll("a").length,
			1,
		);
	});
});
