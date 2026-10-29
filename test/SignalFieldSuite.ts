import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suite, test, type TestContext } from "node:test";
import { JSDOM } from "jsdom";
import { startSignalField } from "../src/components/signal-field-animation.ts";
import { fallingCharacterSpeed } from "../src/components/falling-character-speed.ts";

function mountSignalField(
	context: TestContext,
	{ width = 300, height = 600, hidden = false, reducedMotion = false } = {},
) {
	const dom = new JSDOM('<div class="signal-field"></div>', {
		pretendToBeVisual: true,
	});
	const browser = dom.window;
	const document = browser.document;
	const field = document.querySelector<HTMLDivElement>(".signal-field")!;
	const animations: {
		element: Element;
		keyframes: Keyframe[];
		options: KeyframeAnimationOptions;
		currentTime: number;
		playState: string;
		pause(): void;
		play(): void;
		cancel(): void;
	}[] = [];
	const media = new browser.EventTarget();
	Object.defineProperty(media, "matches", { get: () => reducedMotion });
	browser.matchMedia = () => media as unknown as MediaQueryList;
	Object.defineProperty(document, "hidden", { get: () => hidden });
	Object.defineProperty(field, "clientWidth", { get: () => width });
	Object.defineProperty(field, "clientHeight", { get: () => height });
	field.getBoundingClientRect = () => ({ left: 30 }) as DOMRect;
	const frameRequests = context.mock.method(browser, "requestAnimationFrame");
	const intervals = context.mock.method(browser, "setInterval");
	let intersection!: IntersectionObserverCallback;
	let disconnected = false;
	browser.IntersectionObserver = class {
		constructor(callback: IntersectionObserverCallback) {
			intersection = callback;
		}
		observe(element: Element) {
			assert.equal(element, field);
		}
		disconnect() {
			disconnected = true;
		}
	} as unknown as typeof IntersectionObserver;
	browser.Element.prototype.animate = function (keyframes, options) {
		const animation = {
			element: this,
			keyframes: keyframes as Keyframe[],
			options: options as KeyframeAnimationOptions,
			currentTime: 0,
			playState: "running",
			pause() {
				this.playState = "paused";
			},
			play() {
				this.playState = "running";
			},
			cancel() {
				this.playState = "idle";
			},
		};
		animations.push(animation);
		return animation as unknown as Animation;
	};
	let randomValue = 0.2;
	const random = () => {
		randomValue = (randomValue + 0.137) % 1;
		return randomValue;
	};
	const cleanup = startSignalField(
		field,
		browser as unknown as Window & typeof globalThis,
		random,
	);
	context.after(() => {
		cleanup();
		dom.window.close();
	});
	return {
		field,
		browser,
		document,
		animations,
		frameRequests,
		intervals,
		get disconnected() {
			return disconnected;
		},
		get traces() {
			return [...field.children] as HTMLElement[];
		},
		resize(nextWidth = width, nextHeight = height) {
			width = nextWidth;
			height = nextHeight;
			browser.dispatchEvent(new browser.Event("resize"));
		},
		setAddressLane(left?: number) {
			document.querySelector(".network-address-stream__window")?.remove();
			if (left !== undefined) {
				const address = document.createElement("button");
				address.className = "network-address-stream__window";
				address.getBoundingClientRect = () =>
					({ left, right: left + 16 }) as DOMRect;
				document.body.append(address);
			}
			browser.dispatchEvent(new browser.Event("scroll"));
		},
		setVisible(visible: boolean) {
			intersection(
				[{ isIntersecting: visible }] as IntersectionObserverEntry[],
				{} as IntersectionObserver,
			);
		},
		setHidden(value: boolean) {
			hidden = value;
			document.dispatchEvent(new browser.Event("visibilitychange"));
		},
		setReducedMotion(value: boolean) {
			reducedMotion = value;
			media.dispatchEvent(new browser.Event("change"));
		},
		unmount: cleanup,
	};
}

suite("Signal field", () => {
	test("moves pre-rendered character strips using native transforms without a canvas, frame callbacks, or timers", (context) => {
		const field = mountSignalField(context);
		assert.equal(field.traces.length, 10);
		assert.equal(field.field.querySelectorAll("canvas").length, 0);
		assert.equal(field.frameRequests.mock.callCount(), 0);
		assert.equal(field.intervals.mock.callCount(), 0);
		for (const animation of field.animations) {
			assert.equal(animation.playState, "running");
			assert.equal(animation.options.iterations, Infinity);
			assert.equal(animation.options.easing, "linear");
			assert.ok(animation.currentTime > 0);
			assert.ok(
				animation.currentTime < Number(animation.options.duration),
			);
			assert.ok(
				animation.keyframes.every(
					(frame) => Object.keys(frame).join() === "transform",
				),
			);
			assert.equal(animation.keyframes[1].transform, "translateY(600px)");
			const length = animation.element.children.length;
			assert.ok(length >= 3 && length <= 11);
			assert.equal(
				animation.keyframes[0].transform,
				`translateY(-${length * 24}px)`,
			);
			const speed =
				(600 + length * 24) /
				(Number(animation.options.duration) / 1000);
			assert.ok(
				speed >= fallingCharacterSpeed * 0.35 &&
					speed <= fallingCharacterSpeed * 1.15,
			);
			assert.match(animation.element.textContent!, /^[042/<>{}:]+$/);
		}
	});

	test("bounds the number and size of moving strips on large, high-density displays", (context) => {
		const field = mountSignalField(context, { width: 3840, height: 2160 });
		const stylesheet = field.document.createElement("style");
		stylesheet.textContent = readFileSync(
			new URL("../src/app/globals.css", import.meta.url),
			"utf8",
		);
		field.document.head.append(stylesheet);
		assert.equal(field.traces.length, 24);
		const movingArea = field.traces.reduce((area, trace) => {
			const style = field.browser.getComputedStyle(trace);
			assert.equal(style.position, "absolute");
			assert.equal(style.width, "12px");
			return (
				area +
				Number.parseFloat(style.width) * trace.children.length * 24
			);
		}, 0);
		assert.ok(movingArea <= 24 * 12 * 11 * 24);
		assert.ok(movingArea < 3840 * 2160 * 0.01);
		assert.equal(
			field.browser.getComputedStyle(field.field).overflow,
			"hidden",
		);
		assert.notEqual(
			field.browser.getComputedStyle(field.field).opacity,
			"0.72",
		);
		assert.ok(
			field.traces.some((trace) =>
				trace
					.firstElementChild!.getAttribute("style")!
					.includes("100, 255, 152"),
			),
		);
	});

	test("preserves animation identity, timing, and phase across vertical resizes and scrolling", (context) => {
		const field = mountSignalField(context);
		const before = field.animations.map((animation) => ({
			keyframes: structuredClone(animation.keyframes),
			options: structuredClone(animation.options),
			time: animation.currentTime,
		}));
		for (let index = 0; index < 20; index += 1) {
			field.resize(300, 600 + index * 10);
			field.browser.dispatchEvent(new field.browser.Event("scroll"));
		}
		assert.equal(field.animations.length, before.length);
		for (const [index, animation] of field.animations.entries()) {
			assert.deepEqual(animation.keyframes, before[index].keyframes);
			assert.deepEqual(animation.options, before[index].options);
			assert.equal(animation.currentTime, before[index].time);
		}
	});

	test("adds and removes streams on horizontal resize while retaining surviving animations", (context) => {
		const field = mountSignalField(context);
		const first = field.traces[0];
		field.resize(330);
		assert.equal(field.traces.length, 11);
		assert.equal(field.traces[0], first);
		field.resize(120);
		assert.equal(field.traces.length, 4);
		assert.equal(field.traces[0], first);
		assert.ok(
			field.animations
				.slice(4)
				.every((animation) => animation.playState === "idle"),
		);
	});

	test("reserves the full address column and updates it after scrolling or resizing", (context) => {
		const field = mountSignalField(context);
		const centers = () =>
			field.traces.map(
				(trace) => Number.parseFloat(trace.style.left) + 6,
			);
		field.setAddressLane(100);
		assert.ok(centers().includes(45));
		assert.ok(!centers().includes(75));
		field.setAddressLane(70);
		assert.ok(!centers().includes(45));
		assert.ok(centers().includes(75));
		field.setAddressLane();
		field.resize();
		assert.ok(centers().includes(45));
	});

	test("pauses when hidden or offscreen and resumes only when both are visible", (context) => {
		const field = mountSignalField(context);
		const assertState = (state: string) =>
			assert.ok(
				field.animations.every(
					(animation) => animation.playState === state,
				),
			);
		field.setVisible(false);
		assertState("paused");
		field.setHidden(true);
		field.setVisible(true);
		assertState("paused");
		field.setHidden(false);
		assertState("running");
		field.setHidden(true);
		assertState("paused");
		field.setVisible(false);
		field.setHidden(false);
		assertState("paused");
		field.setVisible(true);
		assertState("running");
	});

	test("starts paused in a hidden document", (context) => {
		const field = mountSignalField(context, { hidden: true });
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "paused",
			),
		);
	});

	test("honors reduced motion at startup and when the preference changes", (context) => {
		const field = mountSignalField(context, { reducedMotion: true });
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "paused",
			),
		);
		assert.ok(field.traces.every((trace) => trace.textContent!.length > 0));
		field.setReducedMotion(false);
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "running",
			),
		);
		field.setReducedMotion(true);
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "paused",
			),
		);
	});

	test("waits for horizontal space before creating streams", (context) => {
		const field = mountSignalField(context, { width: 0 });
		assert.equal(field.traces.length, 0);
		field.resize(300);
		assert.equal(field.traces.length, 10);
	});

	test("cancels animations, disconnects observation, removes listeners, and clears its elements on unmount", (context) => {
		const field = mountSignalField(context);
		field.unmount();
		assert.equal(field.traces.length, 0);
		assert.equal(field.disconnected, true);
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "idle",
			),
		);
		field.resize(330);
		field.setHidden(true);
		field.setReducedMotion(true);
		assert.equal(field.traces.length, 0);
		assert.ok(
			field.animations.every(
				(animation) => animation.playState === "idle",
			),
		);
	});
});
