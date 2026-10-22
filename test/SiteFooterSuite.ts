import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { JSDOM } from "jsdom";
import ts from "typescript";

const substitutes = new Map([
	[
		"./brand-mark",
		'export function BrandMark() { return createElement("a", {"data-brand": true}, "brand"); }',
	],
	[
		"./site-navigation-links",
		'export function SiteNavigationLinks() { return createElement("a", {href: "/blog"}, "blog"); }',
	],
	[
		"./site-visitor-details",
		'export function SiteVisitorDetails() { return createElement("div", {className: "visitor-privacy"}, "visitor details"); }',
	],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			context.parentURL?.endsWith("/site-footer.tsx") &&
			substitutes.has(specifier)
		)
			return {
				url: new URL(
					`./${specifier.slice(2)}-footer-fixture.ts`,
					import.meta.url,
				).href,
				shortCircuit: true,
			};
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		for (const [specifier, source] of substitutes)
			if (url.endsWith(`/${specifier.slice(2)}-footer-fixture.ts`))
				return {
					format: "module",
					shortCircuit: true,
					source: `import {createElement} from "react"; ${source}`,
				};
		if (url.endsWith("/site-footer.tsx"))
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
const { SiteFooter } = await import("../src/components/site-footer.tsx");

test("groups footer navigation and visitor details without repeating the header brand", () => {
	const document = new JSDOM(renderToString(createElement(SiteFooter))).window
		.document;
	assert.equal(document.querySelectorAll("footer").length, 1);
	assert.equal(document.querySelector("[data-brand]"), null);
	const content = document.querySelector(".site-footer__inner")!;
	assert.equal(content.children.length, 2);
	assert.equal(content.firstElementChild?.tagName, "NAV");
	assert.equal(
		content.querySelector("nav")?.getAttribute("aria-label"),
		"Footer navigation",
	);
	assert.ok(content.lastElementChild?.classList.contains("visitor-privacy"));
});
