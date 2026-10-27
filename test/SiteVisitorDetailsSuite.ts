import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { test } from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { averageFallingCharacterSpeed } from "../src/components/falling-character-speed.ts";
import ts from "typescript";

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

for (const address of [
	"::1",
	"192.0.2.42",
	"2001:db8:1234:5678:90ab:cdef:1234:5678",
]) {
	test(`streams ${address} with brief character flickers, a stable accessible value, and pause control`, async (context) => {
		const dom = new JSDOM('<div id="root"></div>');
		dom.window.matchMedia = () => ({ matches: false }) as MediaQueryList;
		let nextCycle!: () => void;
		let cleared = false;
		context.mock.method(
			dom.window,
			"setInterval",
			(callback: () => void, milliseconds: number) => {
				assert.equal(milliseconds, 5000);
				nextCycle = callback;
				return 1;
			},
		);
		context.mock.method(dom.window, "clearInterval", () => {
			cleared = true;
		});
		let randomValues = [0, 0.1, 0.75, 0.8, 0.25, 0.35];
		let randomIndex = 0;
		context.mock.method(
			Math,
			"random",
			() => randomValues[randomIndex++ % randomValues.length],
		);
		let windowHeight = 600;
		Object.defineProperty(
			dom.window.HTMLElement.prototype,
			"clientHeight",
			{
				get(this: HTMLElement) {
					if (
						this.classList.contains(
							"network-address-stream__window",
						)
					)
						return windowHeight;
					if (
						this.classList.contains("network-address-stream__track")
					)
						return 240;
					return 0;
				},
			},
		);
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
				complete(Response.json({ networkAddress: address })),
			);
			assert.ok(
				dom.window.document
					.querySelector("output")!
					.textContent!.includes(address),
			);
			const track = dom.window.document.querySelector(
				'.network-address-stream__track[aria-hidden="true"]',
			)!;
			assert.equal(
				track.querySelectorAll(".network-address-stream__address")
					.length,
				1,
			);
			assert.equal(track.textContent, address);
			const addressCharacters = () => [
				...track.querySelectorAll<HTMLElement>(
					".network-address-stream__character",
				),
			];
			const timings = () =>
				addressCharacters().map((character) => ({
					start: Number.parseFloat(character.style.animationDelay),
					duration: Number.parseFloat(
						character.style.animationDuration,
					),
				}));
			const assertTimingWindow = () => {
				assert.equal(
					new Set(timings().map((timing) => timing.start)).size,
					1,
				);
				for (const { start, duration } of timings()) {
					assert.ok(start >= 2.084);
					assert.ok(start <= 2.4);
					assert.ok(duration >= 0.128 && duration <= 0.8);
					assert.ok(start + duration <= 3.2);
				}
			};
			const initialTimings = timings();
			assertTimingWindow();
			assert.ok(
				new Set(initialTimings.map((timing) => timing.duration)).size >
					1,
			);
			assert.ok(
				new Set(
					initialTimings.map(
						(timing) => timing.start + timing.duration,
					),
				).size > 1,
			);
			const cycleStarts: number[] = [];
			for (const random of [0, 0.999999]) {
				randomValues = [random];
				await act(() => nextCycle());
				assertTimingWindow();
				assert.notDeepEqual(timings(), initialTimings);
				cycleStarts.push(timings()[0].start);
			}
			assert.ok(timings().every((timing) => timing.duration > 0.79));
			assert.notEqual(cycleStarts[0], cycleStarts[1]);
			assert.equal(track.textContent, address);
			assert.ok(
				Math.abs(
					parseFloat((track as HTMLElement).style.animationDuration) -
						(600 + 240) / averageFallingCharacterSpeed,
				) < 0.000001,
			);
			const button = dom.window.document.querySelector("button")!;
			assert.equal(
				button.style.getPropertyValue(
					"--address-animation-window-height",
				),
				"600px",
			);
			windowHeight = 800;
			await act(() =>
				dom.window.dispatchEvent(new dom.window.Event("resize")),
			);
			assert.ok(
				Math.abs(
					parseFloat((track as HTMLElement).style.animationDuration) -
						(600 + 240) / averageFallingCharacterSpeed,
				) < 0.000001,
			);
			assert.equal(
				button.style.getPropertyValue(
					"--address-animation-window-height",
				),
				"600px",
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
				(rule) =>
					"name" in rule && rule.name === "network-address-fall",
			) as CSSKeyframesRule;
			assert.equal(
				(fall.cssRules[0] as CSSKeyframeRule).style.transform,
				"translateY(-100%)",
			);
			assert.equal(
				(fall.cssRules[1] as CSSKeyframeRule).style.transform,
				"translateY(var(--address-animation-window-height))",
			);
			assert.equal(fall.cssRules.length, 2);
			const streamRule = [...style.sheet!.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					rule.selectorText === ".network-address-stream",
			) as CSSStyleRule;
			assert.equal(
				streamRule.style.top,
				"calc(var(--header-height) + 1px)",
			);
			assert.equal(streamRule.style.transform, "");
			const windowRule = [...style.sheet!.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					rule.selectorText === ".network-address-stream__window",
			) as CSSStyleRule;
			assert.equal(
				windowRule.style
					.getPropertyValue("--address-window-height")
					.replace(/\s+/g, ""),
				"calc(100dvh-2*var(--header-height)-2px)",
			);
			assert.equal(
				windowRule.style.getPropertyValue("mask-image"),
				"linear-gradient(transparent, black 6%, black 94%, transparent)",
			);
			const character = [...style.sheet!.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					rule.selectorText === ".network-address-stream__character",
			) as CSSStyleRule;
			assert.equal(
				character.style.height.replace(/\s+/g, ""),
				"min(1.5rem,calc(var(--address-animation-window-height)*0.7/var(--address-length)))",
			);
			assert.equal(character.style.lineHeight, character.style.height);
			assert.equal(
				addressCharacters()
					.map((character) => character.dataset.character)
					.join(""),
				address,
			);
			const glyph = [...style.sheet!.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					rule.selectorText ===
						".network-address-stream__character::after",
			) as CSSStyleRule;
			assert.match(
				style.textContent!,
				/\.network-address-stream__character::after\s*\{[^}]*content: attr\(data-character\)/,
			);
			assert.equal(
				glyph.style.animation,
				"network-address-flicker 0.256s steps(1, end)",
			);
			assert.equal(
				glyph.style.getPropertyValue("animation-delay"),
				"inherit",
			);
			assert.equal(
				glyph.style.getPropertyValue("animation-duration"),
				"inherit",
			);
			const flicker = [...style.sheet!.cssRules].find(
				(rule) =>
					"name" in rule && rule.name === "network-address-flicker",
			) as CSSKeyframesRule;
			assert.match(
				style.textContent!,
				/100%\s*\{\s*content: attr\(data-character\)/,
			);
			assert.ok(
				new Set(
					[...flicker.cssRules].map(
						(frame) => (frame as CSSKeyframeRule).style.content,
					),
				).size >= 4,
			);
			const pause = [...style.sheet!.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					typeof rule.selectorText === "string" &&
					rule.selectorText.includes(":hover") &&
					rule.selectorText.includes(":focus-visible") &&
					rule.selectorText.includes('[aria-pressed="true"]') &&
					rule.selectorText.includes(
						".network-address-stream__character::after",
					),
			) as CSSStyleRule;
			assert.ok(pause);
			assert.equal(pause.style.animation, "none");
			assert.equal(
				character.style.fontSize.replace(/\s+/g, ""),
				"min(0.6875rem,calc(var(--address-animation-window-height)*0.7/var(--address-length)))",
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
			const staticGlyph = [...reducedMotion.cssRules].find(
				(rule) =>
					"selectorText" in rule &&
					rule.selectorText ===
						".network-address-stream__character::after",
			) as CSSStyleRule;
			assert.equal(staticGlyph.style.animation, "none");
			assert.equal(
				staticCharacter.style.height.replace(/\s+/g, ""),
				"min(1.5rem,calc(var(--address-window-height)/var(--address-length)))",
			);
			assert.equal(
				staticCharacter.style.fontSize.replace(/\s+/g, ""),
				"min(0.6875rem,calc(var(--address-window-height)/var(--address-length)))",
			);
			assert.equal(
				button.getAttribute("aria-label"),
				"Pause network address animation",
			);
			await act(() => button.click());
			assert.equal(
				button.getAttribute("aria-label"),
				"Resume network address animation",
			);
			assert.equal(
				dom.window.getComputedStyle(track).position,
				"absolute",
			);
			assert.equal(button.getAttribute("aria-pressed"), "true");
			await act(() => button.click());
			assert.equal(button.getAttribute("aria-pressed"), "false");
			const column = track.querySelector(
				".network-address-stream__address",
			)!;
			assert.equal(dom.window.getComputedStyle(column).display, "flex");
			assert.equal(
				dom.window.getComputedStyle(column).flexDirection,
				"column-reverse",
			);
			const characters = [...column.children] as HTMLElement[];
			assert.equal(
				characters[1].style.opacity,
				characters.at(-1)!.style.opacity,
			);
			cleared = false;
			await act(() => root.unmount());
			assert.equal(cleared, true);
			assert.equal(signal?.aborted, true);
		} finally {
			Object.assign(globalThis, previous);
			dom.window.close();
		}
	});
}

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
			dom.window.matchMedia = () => ({ matches: true }) as MediaQueryList;
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
		dom.window.matchMedia = () => ({ matches: true }) as MediaQueryList;
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
