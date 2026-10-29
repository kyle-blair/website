import { fallingCharacterSpeed } from "./falling-character-speed.ts";

const characters = ["0", "4", "2", "/", "<", ">", "{", "}", ":"];
const columnWidth = 30;
const rowHeight = 24;
const traceWidth = 12;
const maximumTraces = 24;

type Trace = {
	element: HTMLSpanElement;
	animation: Animation;
};

export function startSignalField(
	field: HTMLDivElement,
	browser: Window & typeof globalThis = window,
	random: () => number = Math.random,
) {
	const document = field.ownerDocument;
	const reducedMotion = browser.matchMedia(
		"(prefers-reduced-motion: reduce)",
	);
	const traces: Trace[] = [];
	let isVisible = true;

	function updateMotion() {
		const isPaused = document.hidden || !isVisible || reducedMotion.matches;
		for (const trace of traces) {
			if (isPaused) trace.animation.pause();
			else trace.animation.play();
		}
	}

	function createTrace(height: number, index: number): Trace {
		const element = document.createElement("span");
		element.className = "signal-field__trace";
		const length = 3 + Math.floor(random() * 9);
		const speed = (0.35 + random() * 0.8) * fallingCharacterSpeed;
		for (let character = 0; character < length; character += 1) {
			const glyph = document.createElement("span");
			glyph.textContent =
				characters[Math.floor(random() * characters.length)];
			glyph.style.opacity = `${Math.max(0.04, (1 - character / length) * 0.78)}`;
			if (character === 0 && index % 4 === 0) {
				glyph.style.color = "rgb(100, 255, 152)";
				glyph.style.opacity = "0.8";
			}
			element.append(glyph);
		}
		field.append(element);
		const distance = height + length * rowHeight;
		const duration = (distance / speed) * 1000;
		const animation = element.animate(
			[
				{ transform: `translateY(-${length * rowHeight}px)` },
				{ transform: `translateY(${height}px)` },
			],
			{ duration, iterations: Infinity, easing: "linear" },
		);
		animation.pause();
		animation.currentTime = ((random() * height) / distance) * duration;
		return { element, animation };
	}

	function layout() {
		const width = field.clientWidth;
		const height = field.clientHeight;
		const fieldLeft = field.getBoundingClientRect().left;
		const addressBounds = document
			.querySelector(".network-address-stream__window")
			?.getBoundingClientRect();
		const columns = Array.from(
			{ length: Math.ceil(width / columnWidth) },
			(_, column) => column,
		).filter(
			(column) =>
				!addressBounds ||
				fieldLeft + (column + 1) * columnWidth <= addressBounds.left ||
				fieldLeft + column * columnWidth >= addressBounds.right,
		);
		const count = Math.min(maximumTraces, columns.length);
		while (traces.length > count) {
			const trace = traces.pop()!;
			trace.animation.cancel();
			trace.element.remove();
		}
		for (let index = 0; index < count; index += 1) {
			const trace = traces[index] ?? createTrace(height, index);
			traces[index] = trace;
			const column =
				columns[Math.floor((index * columns.length) / count)];
			trace.element.style.left = `${column * columnWidth + (columnWidth - traceWidth) / 2}px`;
		}
		updateMotion();
	}

	const observer = new browser.IntersectionObserver(([entry]) => {
		isVisible = entry.isIntersecting;
		updateMotion();
	});
	layout();
	observer.observe(field);
	browser.addEventListener("resize", layout);
	browser.addEventListener("scroll", layout, { passive: true });
	document.addEventListener("visibilitychange", updateMotion);
	reducedMotion.addEventListener("change", updateMotion);

	return () => {
		observer.disconnect();
		browser.removeEventListener("resize", layout);
		browser.removeEventListener("scroll", layout);
		document.removeEventListener("visibilitychange", updateMotion);
		reducedMotion.removeEventListener("change", updateMotion);
		for (const trace of traces) trace.animation.cancel();
		field.replaceChildren();
	};
}
