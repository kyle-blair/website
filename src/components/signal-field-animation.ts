const characters = ["0", "4", "2", "/", "<", ">", "{", "}", ":"];

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

	const target: HTMLCanvasElement = canvas;
	const drawingContext: CanvasRenderingContext2D = context;

	const reducedMotion = browser.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	let animationFrame = 0;
	let width = 0;
	let height = 0;
	let pixelRatio = 0;
	let animationTime = 0;
	let previousFrameTime: number | undefined;
	let traces: Trace[] = [];
	let backgroundColor = "#070609";

	function resize() {
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

		pixelRatio = nextPixelRatio;
		width = nextWidth;
		height = nextHeight;
		backgroundColor = browser.getComputedStyle(target).backgroundColor;
		target.width = width * pixelRatio;
		target.height = height * pixelRatio;
		drawingContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

		const columnCount = Math.ceil(width / 30);
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
	}

	function draw(frameTime?: number) {
		if (frameTime !== undefined) {
			if (previousFrameTime !== undefined) {
				// Resume gently if scrolling or a background tab paused drawing.
				animationTime += Math.min(
					frameTime - previousFrameTime,
					50,
				);
			}
			previousFrameTime = frameTime;
		}
		drawingContext.fillStyle = backgroundColor;
		drawingContext.fillRect(0, 0, width, height);
		drawingContext.font = '12px "SFMono-Regular", Consolas, monospace';
		drawingContext.textAlign = "center";

		const columnWidth = 30;
		const rowHeight = 24;

		for (const trace of traces) {
			const x = trace.column * columnWidth + columnWidth / 2;
			const fieldWeight = 0.78;
			const head =
				(trace.offset + animationTime * trace.speed * 0.035) %
				(height + 240);

			for (let index = 0; index < trace.length; index += 1) {
				const y = head - index * rowHeight;
				if (y < -rowHeight || y > height + rowHeight) continue;

				const alpha = Math.max(
					0.04,
					(1 - index / trace.length) * fieldWeight,
				);
				const isHead = index === 0 && trace.column % 4 === 0;
				drawingContext.fillStyle = isHead
					? `rgba(100, 255, 152, ${Math.min(alpha + 0.25, 0.8)})`
					: `rgba(157, 124, 255, ${alpha})`;
				const characterIndex = Math.floor(
					(trace.column * 7 + index * 3 + animationTime * 0.002) %
						characters.length,
				);
				drawingContext.fillText(characters[characterIndex], x, y);
			}
		}

		if (!reducedMotion.matches) {
			animationFrame = browser.requestAnimationFrame(draw);
		}
	}

	resize();
	draw();
	browser.addEventListener("resize", resize);

	return () => {
		browser.cancelAnimationFrame(animationFrame);
		browser.removeEventListener("resize", resize);
	};
}
