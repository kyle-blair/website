import { mkdir, writeFile } from "node:fs/promises";
import { arch, cpus, platform, release } from "node:os";
import { resolve } from "node:path";
import { setTimeout } from "node:timers/promises";
import { expect, test } from "@playwright/test";
import {
	calculateProcessorUsage,
	summarizeProcessorUsage,
} from "./support/processor-usage.ts";

test("establishes idle homepage processor-use baselines", async ({
	browser,
	page,
}, testInfo) => {
	await page.route("**/api/site-visitor", (route) =>
		route.fulfill({
			json: { networkAddress: "192.0.2.42" },
		}),
	);
	const response = await page.goto("/");
	expect(response?.status()).toBe(200);
	await page.bringToFront();
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
	await page.waitForFunction(() => {
		const animations = document
			.querySelector(".signal-field")!
			.getAnimations({ subtree: true });
		return (
			animations.length > 0 &&
			animations.every((animation) => animation.playState === "running")
		);
	});
	await expect(
		page.locator(".network-address-stream__window"),
	).toHaveAttribute("title", /192\.0\.2\.42/);
	expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
	await setTimeout(5000);

	const session = await browser.newBrowserCDPSession();
	const system = await session.send("SystemInfo.getInfo");
	const samples: (ReturnType<typeof calculateProcessorUsage> & {
		background: "running" | "paused";
	})[] = [];

	for (let round = 0; round < 3; round += 1) {
		const modes =
			round % 2 === 0
				? (["running", "paused"] as const)
				: (["paused", "running"] as const);
		for (const background of modes) {
			await test.step(`sample ${round + 1}: background ${background}`, async () => {
				await page.evaluate(async (mode) => {
					const animations = document
						.querySelector(".signal-field")!
						.getAnimations({ subtree: true });
					for (const animation of animations) {
						if (mode === "paused") animation.pause();
						else animation.play();
					}
					await Promise.all(
						animations.map((animation) => animation.ready),
					);
				}, background);
				await setTimeout(1000);
				const before = await session.send("SystemInfo.getProcessInfo");
				const started = performance.now();
				await setTimeout(30_000);
				const after = await session.send("SystemInfo.getProcessInfo");
				const elapsedSeconds = (performance.now() - started) / 1000;
				expect(
					before.processInfo.some(
						(process) => process.type === "renderer",
					),
				).toBe(true);
				expect(
					await page.evaluate(() => document.visibilityState),
				).toBe("visible");
				const states = await page.evaluate(() =>
					document
						.querySelector(".signal-field")!
						.getAnimations({ subtree: true })
						.map((animation) => animation.playState),
				);
				expect(states.length).toBeGreaterThan(0);
				expect(states.every((state) => state === background)).toBe(
					true,
				);
				samples.push({
					background,
					...calculateProcessorUsage(
						before.processInfo,
						after.processInfo,
						elapsedSeconds,
					),
				});
			});
		}
	}

	const running = summarizeProcessorUsage(
		samples.filter((sample) => sample.background === "running"),
	);
	const paused = summarizeProcessorUsage(
		samples.filter((sample) => sample.background === "paused"),
	);
	const summary = {
		running,
		paused,
		backgroundAdditionalPercentagePoints:
			running.medianPercentOfOneCore - paused.medianPercentOfOneCore,
	};
	const recordedAt = new Date().toISOString();
	const report = {
		recordedAt,
		url: page.url(),
		browserVersion: browser.version(),
		nodeVersion: process.version,
		machine: {
			platform: platform(),
			release: release(),
			architecture: arch(),
			model: system.modelName,
			processor: cpus()[0].model,
			logicalProcessors: cpus().length,
		},
		graphics: {
			devices: system.gpu.devices,
			featureStatus: system.gpu.featureStatus,
			attributes: system.gpu.auxAttributes,
		},
		rendering: await page.evaluate(() => ({
			viewport: { width: innerWidth, height: innerHeight },
			devicePixelRatio,
			traces: document.querySelectorAll(".signal-field__trace").length,
			glyphs: document.querySelectorAll(".signal-field__trace > span")
				.length,
		})),
		headless: testInfo.project.use.headless,
		summary,
		samples,
	};
	const directory = resolve("performance-results");
	await mkdir(directory, { recursive: true });
	const path = resolve(
		directory,
		`processor-baseline-${recordedAt.replace(/[:.]/g, "-")}.json`,
	);
	await writeFile(path, JSON.stringify(report, null, 2) + "\n", {
		flag: "wx",
	});
	await testInfo.attach("processor-baseline", {
		path,
		contentType: "application/json",
	});
	console.info(
		JSON.stringify({ event: "processor-baseline", path, summary }),
	);
});
