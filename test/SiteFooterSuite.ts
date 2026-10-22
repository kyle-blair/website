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
		"./site-navigation",
		'export function SiteNavigation({label}) { return createElement("div", {className: "site-navigation__inner"}, createElement("a", {"data-brand": true}, "brand"), createElement("nav", {"aria-label": label}, "links")); }',
	],
]);
registerHooks({
	resolve(specifier, context, nextResolve) {
		if (
			(context.parentURL?.endsWith("/site-footer.tsx") ||
				context.parentURL?.endsWith("/site-header.tsx")) &&
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
		if (
			url.endsWith("/site-footer.tsx") ||
			url.endsWith("/site-header.tsx")
		)
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
const { SiteHeader } = await import("../src/components/site-header.tsx");

test("uses the same navigation layout for both landmarks", () => {
	const header = new JSDOM(renderToString(createElement(SiteHeader))).window
		.document;
	const footer = new JSDOM(renderToString(createElement(SiteFooter))).window
		.document;
	assert.ok(header.querySelector("header"));
	assert.equal(
		header
			.querySelector(".site-navigation__inner")!
			.outerHTML.replace("Primary navigation", "Footer navigation"),
		footer.querySelector(".site-navigation__inner")!.outerHTML,
	);
});

test("mirrors the header brand and navigation without visitor details", () => {
	const document = new JSDOM(renderToString(createElement(SiteFooter))).window
		.document;
	assert.equal(document.querySelectorAll("footer").length, 1);
	assert.ok(document.querySelector("[data-brand]"));
	const content = document.querySelector(".site-navigation__inner")!;
	assert.equal(content.children.length, 2);
	assert.equal(content.firstElementChild?.tagName, "A");
	assert.equal(
		content.querySelector("nav")?.getAttribute("aria-label"),
		"Footer navigation",
	);
	assert.equal(document.querySelector(".visitor-privacy"), null);
});

test("keeps the address stream outside the footer and out of page layout", () => {
	const layout = readFileSync(
		new URL("../src/app/layout.tsx", import.meta.url),
		"utf8",
	);
	assert.match(layout, /<SiteVisitorDetails\s*\/>\s*<SiteFooter\s*\/>/);
	const visitor = readFileSync(
		new URL("../src/components/site-visitor-details.tsx", import.meta.url),
		"utf8",
	);
	assert.doesNotMatch(visitor, /<details/);
	const dom = new JSDOM(
		'<style></style><aside class="network-address-stream"></aside>',
	);
	dom.window.document.querySelector("style")!.textContent = readFileSync(
		new URL("../src/app/globals.css", import.meta.url),
		"utf8",
	);
	assert.equal(
		dom.window.getComputedStyle(dom.window.document.querySelector("aside")!)
			.position,
		"fixed",
	);
	assert.equal(
		dom.window.getComputedStyle(dom.window.document.body).gridTemplateRows,
		"auto 1fr auto",
	);
	dom.window.close();
});
