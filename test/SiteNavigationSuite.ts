import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (context.parentURL?.startsWith("fixture:") && specifier === "react")
			return nextResolve(specifier, {
				...context,
				parentURL: import.meta.url,
			});
		if (context.parentURL?.endsWith("/site-navigation.tsx")) {
			if (
				[
					"next/navigation",
					"./brand-mark",
					"./site-navigation-links",
				].includes(specifier)
			)
				return { url: `fixture:${specifier}`, shortCircuit: true };
		}
		return nextResolve(specifier, context);
	},
	load(url, context, nextLoad) {
		const fixtures: Record<string, string> = {
			"fixture:next/navigation":
				"export function usePathname() { return globalThis.navigationPath; }",
			"fixture:./brand-mark":
				'import {createElement} from "react"; export function BrandMark() { return createElement("a", {href: "/"}, "brand"); }',
			"fixture:./site-navigation-links":
				'import {createElement} from "react"; export function SiteNavigationLinks({onNavigate}) { return createElement("a", {href: "/blog", onClick: onNavigate}, "blog"); }',
		};
		if (fixtures[url])
			return {
				format: "module",
				source: fixtures[url],
				shortCircuit: true,
			};
		return nextLoad(url, context);
	},
});

const { SiteNavigation } =
	await import("../src/components/site-navigation.tsx");

test("header and footer share navigation, with independent mobile menus that reset after navigation", async () => {
	const dom = new JSDOM('<div id="root"></div>');
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		IS_REACT_ACT_ENVIRONMENT: true,
		navigationPath: "/",
	});
	const root = createRoot(dom.window.document.getElementById("root")!);
	const render = () =>
		root.render(
			createElement(
				"div",
				{},
				createElement(SiteNavigation, { label: "Primary navigation" }),
				createElement(SiteNavigation, { label: "Footer navigation" }),
			),
		);
	try {
		await act(render);
		const rows = [
			...dom.window.document.querySelectorAll(".site-navigation__inner"),
		];
		assert.equal(rows.length, 2);
		assert.equal(
			rows[0].innerHTML.replace(
				"Primary navigation",
				"Footer navigation",
			),
			rows[1].innerHTML,
		);
		const buttons = [...dom.window.document.querySelectorAll("button")];
		await act(() => buttons[1].click());
		assert.equal(buttons[0].getAttribute("aria-expanded"), "false");
		assert.equal(buttons[1].getAttribute("aria-expanded"), "true");
		assert.equal(buttons[1].getAttribute("aria-label"), "Close navigation");
		const link =
			dom.window.document.querySelector<HTMLAnchorElement>(
				".mobile-nav a",
			)!;
		link.addEventListener("click", (event) => event.preventDefault());
		await act(() => link.click());
		assert.equal(buttons[1].getAttribute("aria-expanded"), "false");
		await act(() => buttons[0].click());
		assert.equal(
			dom.window.document.querySelectorAll(".mobile-nav").length,
			1,
		);
		Object.assign(globalThis, { navigationPath: "/blog" });
		await act(render);
		assert.equal(
			dom.window.document.querySelectorAll(".mobile-nav").length,
			0,
		);
	} finally {
		await act(() => root.unmount());
		Object.assign(globalThis, previous);
		dom.window.close();
	}
});
