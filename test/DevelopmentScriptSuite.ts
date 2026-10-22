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
printf '%s\\n' "$*" >> "$DEVELOPMENT_COMMAND_LOG"
case "$*" in
    "compose version") exit "${"${PROVIDER_EXIT_STATUS:-0}"}" ;;
    "info") exit "${"${ENGINE_EXIT_STATUS:-0}"}" ;;
    "compose up --detach --build --force-recreate telemetry")
        printf 'telemetry startup attempted\\n'
        if [[ "${"${COLLECTOR_EXIT_STATUS:-0}"}" != 0 ]]; then
            printf 'collector configuration is invalid\\n' >&2
        fi
        exit "${"${COLLECTOR_EXIT_STATUS:-0}"}"
        ;;
    "compose stop storage database telemetry") exit "${"${CLEANUP_EXIT_STATUS:-0}"}" ;;
    "exec storage node "*) exit "${"${STORAGE_READINESS_EXIT_STATUS:-0}"}" ;;
    "compose ps --quiet") printf 'database\\nstorage\\ntelemetry\\nwebsite\\n' ;;
    'inspect --format {{index .Config.Labels "com.docker.compose.service"}} '*) printf '%s\\n' "${"${!#}"}" ;;
    inspect*)
        case "${"${!#}"}" in
            database) printf '%s\\n' "${"${DATABASE_STATE:-running healthy}"}" ;;
            storage) printf '%s\\n' "${"${STORAGE_STATE:-running healthy}"}" ;;
            telemetry) printf '%s\\n' "${"${TELEMETRY_STATE:-running}"}" ;;
            *) exit 2 ;;
        esac
        ;;
    "compose up --detach --build --force-recreate --wait storage"|"compose up --detach --build --force-recreate storage"|"compose up --detach --build --force-recreate database storage")
        if [[ "$*" == *"--wait"* && "${"${WAIT_FOR_SERVICES_NOT_BEING_STARTED:-false}"}" == true ]]; then
            printf 'Still waiting for website and telemetry containers that were not started\\n' >&2
            exit 124
        fi
        [[ "$STORAGE_SERVICE_TOKEN" == "$EXPECTED_STORAGE_SERVICE_TOKEN" ]] || exit 12
        if [[ "${"${SERVICE_EXIT_STATUS:-0}"}" != 0 ]]; then
            printf 'storage port is already allocated\\n' >&2
            exit "$SERVICE_EXIT_STATUS"
        fi
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
if [[ "${"${EXPECT_SERVICES:-true}"}" == true ]]; then
[[ "$STORAGE_SERVICE_TOKEN" == "$EXPECTED_STORAGE_SERVICE_TOKEN" ]] || exit 14
[[ "$STORAGE_SERVICE_URL" == "http://127.0.0.1:10001" && "$STORAGE_ALLOW_HTTP" == true ]] || exit 15
fi
printf 'website started\\n'
exit "${"${WEBSITE_EXIT_STATUS:-0}"}"
`,
		);
		writeFileSync(join(commands, "sleep"), "#!/bin/bash\nexit 0\n");
		for (const command of ["podman", "npm", "sleep"])
			chmodSync(join(commands, command), 0o755);
		function run(
			token: string,
			overrides: Record<string, string> = {},
			websiteArguments: string[] = ["--port", "4321"],
		) {
			const environment = { ...process.env };
			delete environment.STORAGE_SERVICE_TOKEN;
			delete environment.POSTGRES_PASSWORD;
			return spawnSync(
				"/bin/bash",
				[join(directory, "scripts/dev.sh"), ...websiteArguments],
				{
					encoding: "utf8",
					timeout: 10000,
					env: {
						...environment,
						PATH: commands,
						EXPECTED_STORAGE_SERVICE_TOKEN: token,
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

	test("starts the website without waiting for containers that were not started", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			WAIT_FOR_SERVICES_NOT_BEING_STARTED: "true",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /storage ready/);
		assert.match(result.stdout, /website started/);
		assert.doesNotMatch(result.stdout, /without backing services/);
		assert.doesNotMatch(result.stderr, /containers that were not started/);
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

	test("starts the website when the container provider is unavailable", (context) => {
		const { run } = fixture(context);
		const result = run("", {
			PROVIDER_EXIT_STATUS: "1",
			EXPECT_SERVICES: "false",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
		assert.match(result.stdout + result.stderr, /without backing services/);
	});

	test("starts without containers when explicitly requested", (context) => {
		const { run } = fixture(context);
		const result = run("", { EXPECT_SERVICES: "false" }, [
			"--without-services",
			"--port",
			"4321",
		]);
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /without backing services/);
	});

	test("starts the website even when local services and their cleanup fail", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			SERVICE_EXIT_STATUS: "1",
			CLEANUP_EXIT_STATUS: "1",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
	});

	test("starts the website when the collector cannot start", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			COLLECTOR_EXIT_STATUS: "1",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
		assert.match(result.stderr, /Telemetry collector unavailable/);
	});

	test("attempts telemetry even when storage fails and explains how to diagnose and retry", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			SERVICE_EXIT_STATUS: "1",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /telemetry startup attempted/);
		assert.match(result.stdout, /website started/);
		assert.match(result.stderr, /storage port is already allocated/);
		assert.match(
			result.stderr,
			/Could not start local services: database storage/,
		);
		assert.match(
			result.stderr,
			/podman compose --file compose.yaml --file development\/compose.yaml logs --tail 50 database storage/,
		);
		assert.match(result.stderr, /npm run dev/);
	});

	test("reports collector startup errors with a command to inspect its logs", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			COLLECTOR_EXIT_STATUS: "1",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
		assert.match(result.stderr, /collector configuration is invalid/);
		assert.match(
			result.stderr,
			/Could not start local services: telemetry/,
		);
		assert.match(result.stderr, /logs --tail 50 telemetry/);
	});

	for (const [service, state] of [
		["database", "running unhealthy"],
		["storage", "exited"],
		["telemetry", "exited"],
	]) {
		test(`reports ${service} failing after its detached startup command succeeds`, (context) => {
			const { run } = fixture(context);
			const result = run("test-token", {
				STORAGE_SERVICE_TOKEN: "test-token",
				[`${service.toUpperCase()}_STATE`]: state,
			});
			assert.equal(result.status, 0, result.stdout + result.stderr);
			assert.match(result.stdout, /telemetry startup attempted/);
			assert.match(result.stdout, /website started/);
			assert.ok(
				result.stderr.includes(`${service}: ${state}`),
				result.stderr,
			);
			assert.match(result.stderr, /logs --tail 50/);
		});
	}

	test("bounds readiness checks so a starting service cannot prevent website startup forever", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			STORAGE_STATE: "running starting",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
		assert.match(
			result.stderr,
			/storage did not become ready after 60 checks/,
		);
	});

	test("checks only development containers and starts the collector before the website", (context) => {
		const { directory, run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		const commands = readFileSync(join(directory, "commands.log"), "utf8");
		for (const service of ["database", "storage", "telemetry"]) {
			assert.ok(commands.includes(`}} ${service}`), commands);
		}
		assert.doesNotMatch(commands, /--wait|--all --quiet|--quiet website/);
		assert.match(
			result.stdout,
			/telemetry startup attempted[\s\S]*website started/,
		);
	});

	test("explains how to restore Compose when its provider is unavailable", (context) => {
		const { run } = fixture(context);
		const result = run("", {
			PROVIDER_EXIT_STATUS: "1",
			EXPECT_SERVICES: "false",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stderr, /Install or repair.*Compose/);
		assert.match(result.stderr, /podman compose version/);
	});

	test("explains how to start Podman when its engine is unavailable", (context) => {
		const { run } = fixture(context);
		const result = run("", {
			ENGINE_EXIT_STATUS: "1",
			EXPECT_SERVICES: "false",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stderr, /podman machine start/);
		assert.match(result.stderr, /podman info/);
	});

	test("explains how to recover when the website exits with an error", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			WEBSITE_EXIT_STATUS: "9",
		});
		assert.equal(result.status, 9, result.stdout + result.stderr);
		assert.match(result.stderr, /Website exited with status 9/);
		assert.match(result.stderr, /npm run dev -- --port/);
	});

	test("reports a database failure even when storage passes its liveness health check", (context) => {
		const { run } = fixture(context);
		const result = run("test-token", {
			STORAGE_SERVICE_TOKEN: "test-token",
			STORAGE_READINESS_EXIT_STATUS: "1",
		});
		assert.equal(result.status, 0, result.stdout + result.stderr);
		assert.match(result.stdout, /website started/);
		assert.match(result.stdout, /telemetry startup attempted/);
		assert.match(result.stderr, /Storage cannot use PostgreSQL/);
		assert.match(result.stderr, /logs --tail 50 database storage/);
		assert.match(result.stderr, /original accounts and passwords/);
	});

	for (const failure of [
		"SERVICE_EXIT_STATUS",
		"STORAGE_READINESS_EXIT_STATUS",
		"COLLECTOR_EXIT_STATUS",
	]) {
		test(`preserves database data and credentials when ${failure} prevents startup`, (context) => {
			const { directory, run } = fixture(context);
			const credentials =
				"STORAGE_SERVICE_TOKEN=test-token\nPOSTGRES_PASSWORD=saved-password\n";
			writeFileSync(join(directory, ".env"), credentials);
			const result = run("test-token", { [failure]: "1" });
			assert.equal(result.status, 0, result.stdout + result.stderr);
			const commands = readFileSync(
				join(directory, "commands.log"),
				"utf8",
			);
			assert.doesNotMatch(commands, /compose down|--volumes/);
			assert.equal(
				readFileSync(join(directory, ".env"), "utf8"),
				credentials,
			);
			assert.match(result.stdout, /website started/);
			assert.match(result.stderr, /retaining.*database/i);
			assert.equal(
				commands.split(
					"compose up --detach --build --force-recreate database storage",
				).length - 1,
				1,
			);
			assert.equal(
				commands.split(
					"compose up --detach --build --force-recreate telemetry",
				).length - 1,
				1,
			);
		});
	}
});
