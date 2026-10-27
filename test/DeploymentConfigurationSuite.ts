import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { suite, test } from "node:test";

suite("Deployment configuration", () => {
	test("connects the website directly to PostgreSQL and migrates before deployment", async () => {
		const render = await readFile(
			new URL("../render.yaml", import.meta.url),
			"utf8",
		);
		assert.match(
			render,
			/preDeployCommand: node scripts\/migrate-database\.mjs/,
		);
		assert.match(render, /key: DATABASE_URL\s+fromDatabase:/);
		assert.doesNotMatch(render, /zerofourtwo\.com-storage|STORAGE_SERVICE/);

		const container = await readFile(
			new URL("../containerfile", import.meta.url),
			"utf8",
		);
		assert.match(container, /scripts\/migrate-database\.mjs/);
		assert.match(container, /database\/schema\.sql/);
	});

	test("deploys only the website after validation", async () => {
		const workflow = await readFile(
			new URL(
				"../.github/workflows/on-push-to-main.yaml",
				import.meta.url,
			),
			"utf8",
		);
		assert.doesNotMatch(workflow, /deploy-storage|STORAGE_DEPLOY/);
		assert.match(workflow, /deploy-website/);
		assert.doesNotMatch(workflow, /deploy-telemetry|TELEMETRY_DEPLOY/);
	});
});
