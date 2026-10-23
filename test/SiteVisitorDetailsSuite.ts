import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "@/domain/network-address-value")
			return {
				url: new URL(
					"../src/domain/network-address-value.ts",
					import.meta.url,
				).href,
				shortCircuit: true,
			};
		if (specifier === "./network-address-view")
			return {
				url: new URL(
					"../src/components/network-address-view.ts",
					import.meta.url,
				).href,
				shortCircuit: true,
			};
		return nextResolve(specifier, context);
	},
});

const { SiteVisitorDetails } =
	await import("../src/components/site-visitor-details.tsx");

test("streams the actual address in one decorative column, with a stable accessible value and pause control", async () => {
	const dom = new JSDOM('<div id="root"></div>');
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		fetch: globalThis.fetch,
	};
	Object.assign(globalThis, {
		window: dom.window,
		document: dom.window.document,
		IS_REACT_ACT_ENVIRONMENT: true,
	});
	let complete!: (value: Response) => void;
	let signal: AbortSignal | undefined;
	globalThis.fetch = async (url, options) => {
		assert.equal(url, "/api/site-visitor");
		signal = options?.signal as AbortSignal;
		return new Promise((resolve) => {
			complete = resolve;
		});
	};
	const root = createRoot(dom.window.document.getElementById("root")!);
	try {
		await act(() => root.render(createElement(SiteVisitorDetails)));
		assert.match(
			dom.window.document.querySelector("output")!.textContent!,
			/Loading address/,
		);
		await act(() =>
			complete(Response.json({ networkAddress: "2001:db8::42" })),
		);
		assert.match(
			dom.window.document.querySelector("output")!.textContent!,
			/2001:db8::42/,
		);
		const track = dom.window.document.querySelector(
			'.network-address-stream__track[aria-hidden="true"]',
		)!;
		assert.equal(
			track.querySelectorAll(".network-address-stream__address").length,
			1,
		);
		assert.equal(track.textContent, "2001:db8::42");
		assert.ok(
			Math.abs(
				parseFloat((track as HTMLElement).style.animationDuration) -
					("2001:db8::42".length + 21) * 1.44,
			) < 0.000001,
		);
		const style = dom.window.document.createElement("style");
		style.textContent = readFileSync(
			new URL("../src/app/globals.css", import.meta.url),
			"utf8",
		);
		dom.window.document.head.append(style);
		assert.equal(
			dom.window.getComputedStyle(
				dom.window.document.querySelector("aside")!,
			).position,
			"fixed",
		);
		assert.equal(
			dom.window.getComputedStyle(dom.window.document.body)
				.gridTemplateRows,
			"auto 1fr auto",
		);
		const fall = [...style.sheet!.cssRules].find(
			(rule) => "name" in rule && rule.name === "network-address-fall",
		) as CSSKeyframesRule;
		assert.equal(
			(fall.cssRules[0] as CSSKeyframeRule).style.transform,
			"translateY(-100%)",
		);
		assert.equal(
			(fall.cssRules[1] as CSSKeyframeRule).style.transform,
			"translateY(calc(var(--address-window-height) + 3rem))",
		);
		const reducedMotion = [...style.sheet!.cssRules].find(
			(rule) =>
				"conditionText" in rule &&
				rule.conditionText === "(prefers-reduced-motion: reduce)",
		) as CSSMediaRule;
		const staticCharacter = [...reducedMotion.cssRules].find(
			(rule) =>
				"selectorText" in rule &&
				rule.selectorText === ".network-address-stream__character",
		) as CSSStyleRule;
		assert.equal(
			staticCharacter.style.height.replace(/\s+/g, ""),
			"min(1.5rem,calc(var(--address-window-height)/var(--address-length)))",
		);
		const button = dom.window.document.querySelector("button")!;
		assert.equal(
			button.getAttribute("aria-label"),
			"Pause network address animation",
		);
		await act(() => button.click());
		assert.equal(
			button.getAttribute("aria-label"),
			"Resume network address animation",
		);
		assert.equal(dom.window.getComputedStyle(track).position, "absolute");
		assert.equal(button.getAttribute("aria-pressed"), "true");
		await act(() => button.click());
		assert.equal(button.getAttribute("aria-pressed"), "false");
		const column = track.querySelector(".network-address-stream__address")!;
		assert.equal(dom.window.getComputedStyle(column).display, "flex");
		assert.equal(
			dom.window.getComputedStyle(column).flexDirection,
			"column-reverse",
		);
		assert.equal(
			(column.firstElementChild as HTMLElement).style.opacity,
			"1",
		);
		assert.ok(
			Number((column.lastElementChild as HTMLElement).style.opacity) <
				0.3,
		);
		await act(() => root.unmount());
		assert.equal(signal?.aborted, true);
	} finally {
		Object.assign(globalThis, previous);
		dom.window.close();
	}
});

test("contains unavailable, malformed, and failed responses, including cancellation", async () => {
	const previous = {
		window: globalThis.window,
		document: globalThis.document,
		fetch: globalThis.fetch,
	};
	try {
		for (const result of [
			new Response(null, { status: 503 }),
			Response.json({ networkAddress: 42 }),
			Response.json({ networkAddress: " " }),
			new Error("offline"),
			new DOMException("aborted", "AbortError"),
		]) {
			const dom = new JSDOM('<div id="root"></div>');
			Object.assign(globalThis, {
				window: dom.window,
				document: dom.window.document,
				IS_REACT_ACT_ENVIRONMENT: true,
			});
			globalThis.fetch = async () => {
				if (result instanceof Error) throw result;
				return result;
			};
			const root = createRoot(
				dom.window.document.getElementById("root")!,
			);
			await act(() => root.render(createElement(SiteVisitorDetails)));
			assert.match(
				dom.window.document.querySelector("output")!.textContent!,
				/unavailable/,
			);
			await act(() => root.unmount());
			dom.window.close();
		}
		const dom = new JSDOM('<div id="root"></div>');
		Object.assign(globalThis, {
			window: dom.window,
			document: dom.window.document,
		});
		globalThis.fetch = async (url, options) =>
			new Promise((resolve, reject) =>
				options?.signal?.addEventListener("abort", () =>
					reject(new DOMException("aborted", "AbortError")),
				),
			);
		const root = createRoot(dom.window.document.getElementById("root")!);
		await act(() => root.render(createElement(SiteVisitorDetails)));
		await act(() => root.unmount());
		dom.window.close();
	} finally {
		Object.assign(globalThis, previous);
	}
});
