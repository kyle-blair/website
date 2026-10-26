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
printf '%s\\n' "$*" >> "$DEVELOPMENT_COMMAND_LOG"
case "$*" in
    "compose version") exit "${"${PROVIDER_EXIT_STATUS:-0}"}" ;;
    "info") exit "${"${ENGINE_EXIT_STATUS:-0}"}" ;;
    "compose stop database") exit "${"${CLEANUP_EXIT_STATUS:-0}"}" ;;
    "compose ps --quiet") printf 'database\\n' ;;
    'inspect --format {{index .Config.Labels "com.docker.compose.service"}} database') printf 'database\\n' ;;
    'inspect --format {{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}} database') printf '%s\\n' "${"${DATABASE_STATE:-running healthy}"}" ;;
    "compose up --detach --build --force-recreate --remove-orphans database")
        if [[ "${"${SERVICE_EXIT_STATUS:-0}"}" != 0 ]]; then
            printf 'database port is already allocated\\n' >&2
            exit "$SERVICE_EXIT_STATUS"
        fi
        ;;
    *) printf 'Unsupported provider command: %s\\n' "$*" >&2; exit 2 ;;
esac
`,
		);
		writeFileSync(
			join(commands, "npm"),
			`#!/bin/bash
printf 'npm %s\\n' "$*" >> "$DEVELOPMENT_COMMAND_LOG"
case "$*" in
    "run database:migrate")
        [[ "$DATABASE_URL" == "postgresql://storage_service:saved-password@127.0.0.1:54320/website" ]] || exit 12
        exit "${"${MIGRATION_EXIT_STATUS:-0}"}"
        ;;
    "exec -- next dev --port 4321")
        printf 'website started\\n'
        exit "${"${WEBSITE_EXIT_STATUS:-0}"}"
        ;;
    *) exit 13 ;;
esac
`,
		);
		writeFileSync(join(commands, "sleep"), "#!/bin/bash\nexit 0\n");
		for (const command of ["podman", "npm", "sleep"])
			chmodSync(join(commands, command), 0o755);

		function run(
			overrides: Record<string, string> = {},
			args = ["--port", "4321"],
		) {
			const environment = { ...process.env };
			delete environment.DATABASE_URL;
			delete environment.POSTGRES_PASSWORD;
			return spawnSync(
				"/bin/bash",
				[join(directory, "scripts/dev.sh"), ...args],
				{
					encoding: "utf8",
					timeout: 10000,
					env: {
						...environment,
						PATH: commands,
						DEVELOPMENT_COMMAND_LOG: join(
							directory,
							"commands.log",
						),
						...overrides,
					},
				},
			);
		}
		return { directory, run };
	}

	test("starts PostgreSQL, applies the schema, and starts the website", (context) => {
		const { directory, run } = fixture(context);
		writeFileSync(
			join(directory, ".env"),
			"POSTGRES_PASSWORD=saved-password\n",
		);
		const result = run();
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /database.*healthy/i);
		assert.match(result.stdout, /website started/);
		assert.match(result.stdout, /Stopping the local database/);
		assert.doesNotMatch(result.stdout + result.stderr, /saved-password/);
		const commands = readFileSync(join(directory, "commands.log"), "utf8");
		assert.match(commands, /compose up .* database/);
		assert.match(commands, /npm run database:migrate/);
		assert.match(commands, /compose stop database/);
		assert.equal(statSync(join(directory, ".env")).mode & 0o777, 0o600);
	});

	test("starts without persistence when explicitly requested", (context) => {
		const { run } = fixture(context);
		const result = run({}, ["--without-services", "--port", "4321"]);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /without backing services/);
	});

	for (const [failure, message] of [
		["PROVIDER_EXIT_STATUS", /Install or repair.*Compose/],
		["ENGINE_EXIT_STATUS", /podman machine start/],
	] as const) {
		test(`starts without persistence when ${failure} prevents containers`, (context) => {
			const { run } = fixture(context);
			const result = run({ [failure]: "1" });
			assert.equal(result.status, 0, result.stdout + result.stderr);
			assert.match(result.stdout, /website started/);
			assert.match(result.stderr, message);
		});
	}

	for (const failure of [
		"SERVICE_EXIT_STATUS",
		"MIGRATION_EXIT_STATUS",
	] as const) {
		test(`keeps the website available when ${failure} prevents persistence`, (context) => {
			const { directory, run } = fixture(context);
			writeFileSync(
				join(directory, ".env"),
				"POSTGRES_PASSWORD=saved-password\n",
			);
			const result = run({ [failure]: "1" });
			assert.equal(result.status, 0, result.stdout + result.stderr);
			assert.match(result.stdout, /website started/);
			assert.match(result.stderr, /Persistent counters are unavailable/);
			assert.doesNotMatch(
				readFileSync(join(directory, "commands.log"), "utf8"),
				/compose down|--volumes/,
			);
		});
	}

	test("preserves the website exit status", (context) => {
		const { directory, run } = fixture(context);
		writeFileSync(
			join(directory, ".env"),
			"POSTGRES_PASSWORD=saved-password\n",
		);
		const result = run({ WEBSITE_EXIT_STATUS: "9" });
		assert.equal(result.status, 9, result.stdout + result.stderr);
		assert.match(result.stderr, /Website exited with status 9/);
	});
});
