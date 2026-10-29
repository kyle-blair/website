import assert from "node:assert/strict";
import { suite, test, type TestContext } from "node:test";
import { startSignalField } from "../src/components/signal-field-animation.ts";

type Glyph = {
	character: string;
	x: number;
	y: number;
	color?: string;
	alpha?: number;
};

function mountSignalField(
	context: TestContext,
	reducedMotion = false,
	glyphContextAvailable = true,
) {
	let glyphs: Glyph[] = [];
	let canvasResets = 0;
	let paints = 0;
	let textDraws = 0;
	let layoutReads = 0;
	let addressLeft: number | undefined;
	const atlasGlyphs: Glyph[] = [];
	const atlasContext = {
		fillStyle: "",
		setTransform() {},
		fillText(character: string, x: number, y: number) {
			textDraws += 1;
			atlasGlyphs.push({ character, x, y, color: this.fillStyle });
		},
	};
	const atlas = {
		width: 0,
		height: 0,
		getContext: () => (glyphContextAvailable ? atlasContext : null),
	};
	let nextFrame = 0;
	let cleanup: (() => void) | undefined;
	const frames = new Map<number, FrameRequestCallback>();
	const listeners = new Map<string, () => void>();
	const drawingContext = {
		globalAlpha: 1,
		setTransform() {},
		fillRect() {
			paints += 1;
			glyphs = [];
		},
		fillText(character: string, x: number, y: number) {
			textDraws += 1;
			glyphs.push({ character, x, y });
		},
		drawImage(
			image: unknown,
			sourceX: number,
			sourceY: number,
			sourceWidth: number,
			sourceHeight: number,
			x: number,
			y: number,
			width: number,
			height: number,
		) {
			assert.equal(image, atlas);
			assert.equal(sourceWidth, width * browser.devicePixelRatio);
			assert.equal(sourceHeight, height * browser.devicePixelRatio);
			const glyph = atlasGlyphs.findLast(
				(glyph) =>
					glyph.x ===
						sourceX / browser.devicePixelRatio + width / 2 &&
					glyph.y ===
						sourceY / browser.devicePixelRatio + height * 0.75,
			);
			assert.ok(glyph, "the glyph has been rendered in the atlas");
			glyphs.push({
				character: glyph.character,
				x: x + width / 2,
				y: y + height * 0.75,
				color: glyph.color,
				alpha: this.globalAlpha,
			});
		},
	};
	let bitmapWidth = 0;
	let bitmapHeight = 0;
	const canvas = {
		ownerDocument: {
			createElement(name: string) {
				assert.equal(name, "canvas");
				return atlas;
			},
			querySelector(selector: string) {
				layoutReads += 1;
				assert.equal(selector, ".network-address-stream__window");
				return addressLeft === undefined
					? null
					: {
							getBoundingClientRect: () => ({
								left: addressLeft!,
								right: addressLeft! + 16,
							}),
						};
			},
		},
		getBoundingClientRect: () => ({ left: 30, top: 50 }),
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
		matchMedia: () => ({
			get matches() {
				return reducedMotion;
			},
		}),
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
	const random = () => {
		randomValue = (randomValue + 0.137) % 1;
		return randomValue;
	};
	cleanup = startSignalField(
		canvas as unknown as HTMLCanvasElement,
		browser as unknown as Window,
		random,
	);
	context.after(() => cleanup?.());

	return {
		canvas,
		browser,
		frames,
		listeners,
		get paints() {
			return paints;
		},
		get textDraws() {
			return textDraws;
		},
		get layoutReads() {
			return layoutReads;
		},
		get atlasGlyphs() {
			return atlasGlyphs;
		},
		setAddressLane(left?: number) {
			addressLeft = left;
		},
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
		setReducedMotion(value: boolean) {
			reducedMotion = value;
		},
		scroll() {
			listeners.get("scroll")?.();
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
	test("a canvas without a two-dimensional context leaves the animation inactive", () => {
		const canvas = {
			getContext: () => null,
		} as unknown as HTMLCanvasElement;
		assert.equal(startSignalField(canvas, {} as Window), undefined);
	});
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
		const before = paused.frame(140);
		reference.frame(140);

		const resumed = paused.frame(2140);
		assert.deepEqual(resumed, reference.frame(190));
		assert.ok(
			resumed[0].y > before[0].y,
			"the animation still moves forward",
		);
		assert.deepEqual(paused.frame(2180), reference.frame(230));
	});

	for (const refreshRate of [60, 120, 144]) {
		test(`paints at most 30 frames per second on a ${refreshRate} Hz display without changing speed`, (context) => {
			const animation = mountSignalField(context);
			const reference = mountSignalField(context);
			animation.frame(0);
			reference.frame(0);
			const initialPaints = animation.paints;
			for (let frame = 1; frame <= refreshRate; frame += 1) {
				animation.frame((frame * 1000) / refreshRate);
			}
			for (let frame = 1; frame <= 30; frame += 1) {
				reference.frame((frame * 1000) / 30);
			}
			assert.equal(animation.paints - initialPaints, 30);
			assert.equal(reference.paints - initialPaints, 30);
			assert.equal(
				animation.glyphs[0].character,
				reference.glyphs[0].character,
			);
			assert.ok(
				Math.abs(animation.glyphs[0].y - reference.glyphs[0].y) <
					0.000001,
			);
		});
	}

	test("reuses rendered glyphs until pixel density changes", (context) => {
		const animation = mountSignalField(context);
		const initialTextDraws = animation.textDraws;
		assert.ok(initialTextDraws > 0);
		animation.frame(0);
		for (let frame = 1; frame <= 120; frame += 1)
			animation.frame((frame * 1000) / 120);
		assert.equal(animation.textDraws, initialTextDraws);
		assert.ok(
			animation.glyphs.some(
				({ color }) => color === "rgb(100, 255, 152)",
			),
		);
		assert.ok(
			animation.glyphs.some(
				({ color }) => color === "rgb(157, 124, 255)",
			),
		);
		assert.ok(
			animation.glyphs.every(
				({ alpha }) => alpha! >= 0.04 && alpha! <= 0.8,
			),
		);
		animation.canvas.clientWidth += 30;
		animation.resize();
		assert.equal(animation.textDraws, initialTextDraws);
		animation.browser.devicePixelRatio = 1;
		animation.resize();
		assert.equal(animation.textDraws, initialTextDraws * 2);
	});

	test("stops scheduling frames when reduced motion is enabled during animation", (context) => {
		const animation = mountSignalField(context);
		animation.frame(0);
		animation.setReducedMotion(true);
		animation.frame(40);
		assert.equal(animation.frames.size, 0);
	});
	test("an unavailable glyph context leaves the animation inactive", (context) => {
		const animation = mountSignalField(context, false, false);
		assert.equal(animation.frames.size, 0);
		assert.equal(animation.listeners.size, 0);
		assert.equal(animation.paints, 0);
	});

	test("reduced motion draws a static frame and repaints after resizing", (context) => {
		const still = mountSignalField(context, true);
		assert.ok(still.glyphs.length > 0);
		assert.equal(still.frames.size, 0);
		const paints = still.paints;
		still.canvas.clientHeight += 40;
		still.resize();
		assert.equal(still.paints, paints + 1);
		assert.ok(still.glyphs.length > 0);
		still.unmount();
		assert.equal(still.listeners.size, 0);

		const moving = mountSignalField(context);
		assert.equal(moving.frames.size, 1);
		moving.unmount();
		assert.equal(moving.frames.size, 0);
		assert.equal(moving.listeners.size, 0);
	});

	test("keeps the address lane clear without reading layout during unchanged animation frames", (context) => {
		const animation = mountSignalField(context);
		animation.setAddressLane(100);
		animation.resize();
		const glyphs = animation.frame(100);
		assert.ok(glyphs.some(({ x }) => x === 45));
		assert.ok(glyphs.every(({ x }) => x !== 75));
		const layoutReads = animation.layoutReads;
		for (let time = 140; time <= 940; time += 40) {
			assert.ok(animation.frame(time).every(({ x }) => x !== 75));
		}
		assert.equal(animation.layoutReads, layoutReads);
		animation.setAddressLane(70);
		animation.scroll();
		const movedGlyphs = animation.frame(980);
		assert.ok(movedGlyphs.every(({ x }) => x !== 45));
		assert.ok(movedGlyphs.some(({ x }) => x === 75));
		animation.setAddressLane();
		animation.resize();
		assert.ok(animation.frame(1020).some(({ x }) => x === 45));
	});
});
