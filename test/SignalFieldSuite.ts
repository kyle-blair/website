import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { suite, test, type TestContext } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const component = ts.transpileModule(
	readFileSync(
		new URL("../src/components/signal-field.tsx", import.meta.url),
		"utf8",
	),
	{
		compilerOptions: {
			module: ts.ModuleKind.CommonJS,
			jsx: ts.JsxEmit.ReactJSX,
		},
	},
).outputText;

type Glyph = { character: string; x: number; y: number };

// Run the real component's effect with a controlled canvas and browser clock.
// Each test gets isolated hooks, randomness, listeners, and animation frames.
function mountSignalField(context: TestContext, reducedMotion = false) {
	let glyphs: Glyph[] = [];
	let canvasResets = 0;
	let nextFrame = 0;
	let cleanup: (() => void) | undefined;
	const frames = new Map<number, FrameRequestCallback>();
	const listeners = new Map<string, () => void>();
	const drawingContext = {
		setTransform() {},
		fillRect() {
			glyphs = [];
		},
		fillText(character: string, x: number, y: number) {
			glyphs.push({ character, x, y });
		},
	};
	let bitmapWidth = 0;
	let bitmapHeight = 0;
	const canvas = {
		clientWidth: 300,
		clientHeight: 600,
		get width() {
			return bitmapWidth;
		},
		set width(value: number) {
			bitmapWidth = value;
			canvasResets += 1;
			glyphs = [];
		},
		get height() {
			return bitmapHeight;
		},
		set height(value: number) {
			bitmapHeight = value;
			canvasResets += 1;
			glyphs = [];
		},
		getContext: () => drawingContext,
	};
	const browser = {
		devicePixelRatio: 2,
		matchMedia: () => ({ matches: reducedMotion }),
		getComputedStyle: () => ({ backgroundColor: "#070609" }),
		requestAnimationFrame(callback: FrameRequestCallback) {
			frames.set(++nextFrame, callback);
			return nextFrame;
		},
		cancelAnimationFrame(identifier: number) {
			frames.delete(identifier);
		},
		addEventListener(event: string, listener: () => void) {
			listeners.set(event, listener);
		},
		removeEventListener(event: string, listener: () => void) {
			if (listeners.get(event) === listener) listeners.delete(event);
		},
	};
	let randomValue = 0.2;
	const math = Object.create(Math) as Math;
	math.random = () => {
		randomValue = (randomValue + 0.137) % 1;
		return randomValue;
	};
	const exports = {} as { SignalField: () => unknown };
	runInNewContext(component, {
		exports,
		window: browser,
		Math: math,
		require(name: string) {
			if (name === "react") {
				return {
					useRef: () => ({ current: canvas }),
					useEffect(effect: () => () => void) {
						cleanup = effect();
					},
				};
			}
			if (name === "react/jsx-runtime") return { jsx() {} };
			throw new Error(`Unexpected component import: ${name}`);
		},
	});
	exports.SignalField();
	context.after(() => cleanup?.());

	return {
		canvas,
		browser,
		frames,
		listeners,
		get canvasResets() {
			return canvasResets;
		},
		get glyphs() {
			return glyphs;
		},
		frame(time: number) {
			assert.equal(
				frames.size,
				1,
				"exactly one animation frame is pending",
			);
			const [identifier, callback] = [...frames][0];
			frames.delete(identifier);
			callback(time);
			assert.ok(glyphs.length > 0, "the frame draws visible characters");
			return glyphs;
		},
		resize() {
			const listener = listeners.get("resize");
			assert.ok(listener, "the resize listener is registered");
			listener();
		},
		unmount() {
			cleanup?.();
			cleanup = undefined;
		},
	};
}

suite("Signal field", () => {
	test("scroll-related window resizes leave an unchanged canvas and its characters intact", (context) => {
		const animation = mountSignalField(context);
		const before = animation.frame(100);
		const resets = animation.canvasResets;

		for (let count = 0; count < 20; count += 1) animation.resize();

		assert.equal(animation.canvasResets, resets);
		assert.deepEqual(animation.glyphs, before);
		assert.deepEqual(animation.frame(100), before);
	});

	test("actual canvas resizing preserves existing columns and adds new ones", (context) => {
		const animation = mountSignalField(context);
		const before = animation.frame(100);
		const originalWidth = animation.canvas.clientWidth;
		animation.canvas.clientHeight += 40;
		animation.resize();
		assert.equal(animation.canvas.height, 1280);
		assert.deepEqual(animation.frame(100), before);

		animation.canvas.clientWidth += 30;
		animation.resize();
		assert.equal(animation.canvas.width, 660);
		const after = animation.frame(100);
		assert.deepEqual(
			after.filter(({ x }) => x < originalWidth),
			before,
		);
		assert.ok(after.some(({ x }) => x > originalWidth));
	});

	test("changing pixel density updates the bitmap without resetting the animation", (context) => {
		const animation = mountSignalField(context);
		const before = animation.frame(100);
		animation.browser.devicePixelRatio = 1;
		animation.resize();
		assert.equal(animation.canvas.width, 300);
		assert.equal(animation.canvas.height, 600);
		assert.deepEqual(animation.frame(100), before);
	});

	test("the first animation frame does not jump to the browser's elapsed time", (context) => {
		const animation = mountSignalField(context);
		const before = animation.glyphs;
		assert.deepEqual(animation.frame(60_000), before);
	});

	test("a two-second drawing pause advances at most 50 milliseconds and then resumes normally", (context) => {
		const paused = mountSignalField(context);
		const reference = mountSignalField(context);
		paused.frame(100);
		reference.frame(100);
		const before = paused.frame(116);
		reference.frame(116);

		const resumed = paused.frame(2116);
		assert.deepEqual(resumed, reference.frame(166));
		assert.ok(
			resumed[0].y > before[0].y,
			"the animation still moves forward",
		);
		assert.deepEqual(paused.frame(2132), reference.frame(182));
		assert.deepEqual(paused.frame(2148), reference.frame(198));
	});

	test("normal animation speed is independent of display refresh rate", (context) => {
		const slower = mountSignalField(context);
		const faster = mountSignalField(context);
		slower.frame(100);
		faster.frame(100);
		for (let time = 116; time <= 196; time += 16) slower.frame(time);
		for (let time = 108; time <= 196; time += 8) faster.frame(time);
		assert.deepEqual(slower.glyphs, faster.glyphs);
	});

	test("reduced motion draws a static frame and unmounting removes animation work", (context) => {
		const still = mountSignalField(context, true);
		assert.ok(still.glyphs.length > 0);
		assert.equal(still.frames.size, 0);
		still.unmount();
		assert.equal(still.listeners.size, 0);

		const moving = mountSignalField(context);
		assert.equal(moving.frames.size, 1);
		moving.unmount();
		assert.equal(moving.frames.size, 0);
		assert.equal(moving.listeners.size, 0);
	});
});
