import { fallingCharacterSpeed } from "./falling-character-speed.ts";

const characters = ["0", "4", "2", "/", "<", ">", "{", "}", ":"];
const columnWidth = 30;
const rowHeight = 24;
const frameInterval = 1000 / 30;
const glyphColors = ["rgb(157, 124, 255)", "rgb(100, 255, 152)"];

type Trace = {
	column: number;
	offset: number;
	speed: number;
	length: number;
};

export function startSignalField(
	canvas: HTMLCanvasElement,
	browser: Window = window,
	random: () => number = Math.random,
) {
	const context = canvas.getContext("2d");
	if (!context) return;

	const glyphs = canvas.ownerDocument.createElement("canvas");
	const glyphContext = glyphs.getContext("2d");
	if (!glyphContext) return;

	const target: HTMLCanvasElement = canvas;
	const drawingContext: CanvasRenderingContext2D = context;
	const glyphDrawingContext: CanvasRenderingContext2D = glyphContext;
	const reducedMotion = browser.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	let animationFrame = 0;
	let width = 0;
	let height = 0;
	let pixelRatio = 0;
	let animationTime = 0;
	let timeSincePaint = frameInterval;
	let previousFrameTime: number | undefined;
	let traces: Trace[] = [];
	let backgroundColor = "#070609";
	let addressLane: { left: number; right: number } | undefined;
	let addressLaneChanged = true;

	function renderGlyphs() {
		glyphs.width = characters.length * columnWidth * pixelRatio;
		glyphs.height = glyphColors.length * rowHeight * pixelRatio;
		glyphDrawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
		glyphDrawingContext.font = '12px "SFMono-Regular", Consolas, monospace';
		glyphDrawingContext.textAlign = "center";
		for (const [row, color] of glyphColors.entries()) {
			glyphDrawingContext.fillStyle = color;
			for (const [column, character] of characters.entries()) {
				glyphDrawingContext.fillText(
					character,
					column * columnWidth + columnWidth / 2,
					row * rowHeight + rowHeight * 0.75,
				);
			}
		}
	}

	function invalidateAddressLane() {
		addressLaneChanged = true;
	}

	function resize() {
		invalidateAddressLane();
		const nextPixelRatio = Math.min(browser.devicePixelRatio, 2);
		const nextWidth = target.clientWidth;
		const nextHeight = target.clientHeight;
		if (
			nextWidth === width &&
			nextHeight === height &&
			nextPixelRatio === pixelRatio
		) {
			return;
		}

		if (nextPixelRatio !== pixelRatio) {
			pixelRatio = nextPixelRatio;
			renderGlyphs();
		}
		width = nextWidth;
		height = nextHeight;
		backgroundColor = browser.getComputedStyle(target).backgroundColor;
		target.width = width * pixelRatio;
		target.height = height * pixelRatio;
		drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

		const columnCount = Math.ceil(width / columnWidth);
		traces = Array.from(
			{ length: columnCount },
			(_, column) =>
				traces[column] ?? {
					column,
					offset: random() * height,
					speed: 0.35 + random() * 0.8,
					length: 3 + Math.floor(random() * 9),
				},
		);
		paint();
	}

	function paint() {
		if (addressLaneChanged) {
			const addressBounds = target.ownerDocument
				.querySelector(".network-address-stream__window")
				?.getBoundingClientRect();
			const canvasLeft = target.getBoundingClientRect().left;
			addressLane = addressBounds
				? {
						left: addressBounds.left - canvasLeft,
						right: addressBounds.right - canvasLeft,
					}
				: undefined;
			addressLaneChanged = false;
		}

		drawingContext.globalAlpha = 1;
		drawingContext.fillStyle = backgroundColor;
		drawingContext.fillRect(0, 0, width, height);

		for (const trace of traces) {
			const x = trace.column * columnWidth + columnWidth / 2;
			if (
				addressLane &&
				x + columnWidth / 2 > addressLane.left &&
				x - columnWidth / 2 < addressLane.right
			)
				continue;
			const fieldWeight = 0.78;
			const head =
				(trace.offset +
					(animationTime * trace.speed * fallingCharacterSpeed) /
						1000) %
				(height + 240);

			for (let index = 0; index < trace.length; index += 1) {
				const y = head - index * rowHeight;
				if (y < -rowHeight || y > height + rowHeight) continue;

				const alpha = Math.max(
					0.04,
					(1 - index / trace.length) * fieldWeight,
				);
				const isHead = index === 0 && trace.column % 4 === 0;
				drawingContext.globalAlpha = isHead
					? Math.min(alpha + 0.25, 0.8)
					: alpha;
				const characterIndex = Math.floor(
					(trace.column * 7 + index * 3 + animationTime * 0.002) %
						characters.length,
				);
				drawingContext.drawImage(
					glyphs,
					characterIndex * columnWidth * pixelRatio,
					(isHead ? rowHeight : 0) * pixelRatio,
					columnWidth * pixelRatio,
					rowHeight * pixelRatio,
					x - columnWidth / 2,
					y - rowHeight * 0.75,
					columnWidth,
					rowHeight,
				);
			}
		}
	}

	function draw(frameTime: number) {
		if (previousFrameTime !== undefined) {
			const elapsed = Math.min(frameTime - previousFrameTime, 50);
			animationTime += elapsed;
			timeSincePaint += elapsed;
		}
		previousFrameTime = frameTime;
		if (timeSincePaint >= frameInterval - 0.001) {
			timeSincePaint =
				Math.max(0, timeSincePaint - frameInterval) % frameInterval;
			paint();
		}
		if (!reducedMotion.matches) {
			animationFrame = browser.requestAnimationFrame(draw);
		}
	}

	resize();
	if (!reducedMotion.matches) {
		animationFrame = browser.requestAnimationFrame(draw);
	}
	browser.addEventListener("resize", resize);
	browser.addEventListener("scroll", invalidateAddressLane, {
		passive: true,
	});

	return () => {
		browser.cancelAnimationFrame(animationFrame);
		browser.removeEventListener("resize", resize);
		browser.removeEventListener("scroll", invalidateAddressLane);
	};
}
