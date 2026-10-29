import { defineConfig } from "@playwright/test";

export default defineConfig({
	testDir: "./test/performance",
	testMatch: "**/*.spec.ts",
	workers: 1,
	retries: 0,
	timeout: 300_000,
	reporter: "list",
	outputDir: "test-results/performance",
	use: {
		browserName: "chromium",
		channel: "chromium",
		headless: true,
		baseURL: "http://127.0.0.1:3100",
		viewport: { width: 1920, height: 1080 },
		deviceScaleFactor: 2,
		reducedMotion: "no-preference",
		trace: "off",
		screenshot: "off",
		video: "off",
	},
	webServer: {
		command: "npm run build && npm run start",
		url: "http://127.0.0.1:3100",
		env: { PORT: "3100", HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
		timeout: 180_000,
		reuseExistingServer: false,
	},
});
