import assert from "node:assert/strict";
import {
	chmodSync,
	cpSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { suite, test } from "node:test";

suite("Development startup", () => {
	function fixture(context: { after: (callback: () => void) => void }) {
		const directory = mkdtempSync(join(tmpdir(), "website-development-"));
		context.after(() =>
			rmSync(directory, { recursive: true, force: true }),
		);
		mkdirSync(join(directory, "scripts"));
		cpSync(
			new URL("../scripts/dev.sh", import.meta.url),
			join(directory, "scripts/dev.sh"),
		);
		mkdirSync(join(directory, "node_modules"));
		const commands = join(directory, "commands");
		mkdirSync(commands);
		for (const command of [
			"dirname",
			"touch",
			"chmod",
			"grep",
			"sed",
			"openssl",
		]) {
			const location = spawnSync(
				"/bin/bash",
				["-c", 'type -P "$1"', "bash", command],
				{ encoding: "utf8" },
			);
			assert.equal(location.status, 0);
			symlinkSync(location.stdout.trim(), join(commands, command));
		}
		symlinkSync(process.execPath, join(commands, "node"));
		writeFileSync(
			join(commands, "podman"),
			`#!/bin/bash
case "$*" in
    "compose version"|"info"|"compose stop storage database") exit 0 ;;
    "compose up --detach --build --wait storage")
        [[ "$STORAGE_SERVICE_TOKEN" == "$EXPECTED_STORAGE_SERVICE_TOKEN" ]] || exit 12
        printf 'storage ready\\n'
        ;;
    *) printf 'Unsupported provider command: %s\\n' "$*" >&2; exit 2 ;;
esac
`,
		);
		writeFileSync(
			join(commands, "npm"),
			`#!/bin/bash
[[ "$*" == "exec -- next dev --port 4321" ]] || exit 13
[[ "$STORAGE_SERVICE_TOKEN" == "$EXPECTED_STORAGE_SERVICE_TOKEN" ]] || exit 14
[[ "$STORAGE_SERVICE_URL" == "http://127.0.0.1:10001" && "$STORAGE_ALLOW_HTTP" == true ]] || exit 15
printf 'website started\\n'
exit "${"${WEBSITE_EXIT_STATUS:-0}"}"
`,
		);
		for (const command of ["podman", "npm"])
			chmodSync(join(commands, command), 0o755);
		function run(token: string, overrides: Record<string, string> = {}) {
			const environment = { ...process.env };
			delete environment.STORAGE_SERVICE_TOKEN;
			delete environment.POSTGRES_PASSWORD;
			return spawnSync(
				"/bin/bash",
				[join(directory, "scripts/dev.sh"), "--port", "4321"],
				{
					encoding: "utf8",
					timeout: 10000,
					env: {
						...environment,
						PATH: commands,
						EXPECTED_STORAGE_SERVICE_TOKEN: token,
						...overrides,
					},
				},
			);
		}
		return { directory, run };
	}

	test("starts with a provider without config --environment and preserves quoted credentials", (context) => {
		const { directory, run } = fixture(context);
		const credentials =
			'STORAGE_SERVICE_TOKEN="saved-token"\nPOSTGRES_PASSWORD=saved-password\n';
		writeFileSync(join(directory, ".env"), credentials);
		const result = run("saved-token");
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /storage ready/);
		assert.match(result.stdout, /website started/);
		assert.match(result.stdout, /Stopping local services/);
		assert.doesNotMatch(
			result.stdout + result.stderr,
			/saved-token|saved-password/,
		);
		assert.equal(
			readFileSync(join(directory, ".env"), "utf8"),
			credentials,
		);
		assert.equal(statSync(join(directory, ".env")).mode & 0o777, 0o600);
	});

	test("gives environment credentials precedence and preserves the website exit status", (context) => {
		const { directory, run } = fixture(context);
		writeFileSync(
			join(directory, ".env"),
			"STORAGE_SERVICE_TOKEN=saved-token\nPOSTGRES_PASSWORD=saved-password\n",
		);
		const result = run("environment-token", {
			STORAGE_SERVICE_TOKEN: "environment-token",
			WEBSITE_EXIT_STATUS: "9",
		});
		assert.equal(result.status, 9, result.stdout + result.stderr);
		assert.match(result.stdout, /Stopping local services/);
		assert.doesNotMatch(
			result.stdout + result.stderr,
			/environment-token|saved-token|saved-password/,
		);
	});
});
