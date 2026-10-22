import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

test("website telemetry and request handlers run without service source files", async (context) => {
	const directory = await mkdtemp(join(tmpdir(), "website-packaging-"));
	context.after(() => rm(directory, { recursive: true, force: true }));
	const root = new URL("../", import.meta.url);
	for (const entry of ["package.json", "src", "shared"]) {
		await cp(new URL(entry, root), join(directory, entry), {
			recursive: true,
		});
	}
	await symlink(
		new URL("node_modules", root).pathname,
		join(directory, "node_modules"),
		"dir",
	);
	const result = spawnSync(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`
		import assert from 'node:assert/strict';
		const { register } = await import('./src/instrumentation.ts');
		await register();
		for (const route of ['feedback', 'page-hits']) {
			const { GET } = await import('./src/app/api/' + route + '/route.ts');
			const response = await GET(new Request('http://localhost/api/' + route));
			assert.equal(response.status, 400);
		}
	`,
		],
		{
			cwd: directory,
			encoding: "utf8",
			timeout: 10000,
			env: {
				...process.env,
				NEXT_RUNTIME: "nodejs",
				OTEL_SDK_DISABLED: "true",
			},
		},
	);
	assert.equal(result.status, 0, result.stderr);
});
