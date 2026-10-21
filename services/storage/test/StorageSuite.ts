import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
	PostgresStorage,
	StorageConflict,
	type DatabasePool,
} from "../src/postgres-storage.ts";
import { createApplication } from "../src/application.ts";

async function fixture(context: {
	after: (callback: () => Promise<void>) => void;
}) {
	const database = new PGlite();
	const pool: DatabasePool = {
		query: (text, values) => database.query(text, values),
		connect: async () => ({
			query: (text, values) => database.query(text, values),
			release() {},
		}),
		end: () => database.close(),
	};
	const store = new PostgresStorage(pool);
	await store.initialize();
	context.after(() => pool.end());
	return { store, pool };
}

async function seed(pool: DatabasePool, key: string, value: unknown) {
	await pool.query(
		"INSERT INTO key_value.entries (key, value) VALUES ($1, $2::jsonb) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value",
		[key, JSON.stringify(value)],
	);
}

suite("PostgreSQL persistent storage", () => {
	test("reads existing data without changing its schema or contents", async (context) => {
		const { store, pool } = await fixture(context);
		assert.deepEqual(await store.read("missing"), { found: false });
		await seed(pool, "hits", 12);
		assert.deepEqual(await store.read("hits"), { found: true, value: 12 });
		await seed(pool, "existing-setting", {
			enabled: true,
			nested: [1, null, "text"],
		});
		assert.deepEqual(await store.read("existing-setting"), {
			found: true,
			value: { enabled: true, nested: [1, null, "text"] },
		});
		await seed(pool, "existing-null", null);
		assert.deepEqual(await store.read("existing-null"), {
			found: true,
			value: null,
		});
		await store.initialize();
		assert.deepEqual(await store.read("hits"), { found: true, value: 12 });
		await store.check();
	});

	test("retries initialization after a database outage and recovers without restarting", async (context) => {
		const { pool } = await fixture(context);
		const store = new PostgresStorage(pool);
		const connect = pool.connect.bind(pool);
		let unavailable = true;
		context.mock.method(pool, "connect", async () => {
			if (unavailable) throw new Error("Database offline");
			return connect();
		});
		await assert.rejects(() => store.read("recovery"), /Database offline/);
		await assert.rejects(() => store.check(), /Database offline/);
		await assert.rejects(
			() => store.increment("recovery", crypto.randomUUID()),
			/Database offline/,
		);
		await assert.rejects(
			() => store.removeExpiredOperations(),
			/Database offline/,
		);
		unavailable = false;
		assert.deepEqual(await store.read("recovery"), { found: false });
		assert.equal(await store.increment("recovery", crypto.randomUUID()), 1);
		await store.check();
		await store.removeExpiredOperations();
		assert.deepEqual(await store.read("recovery"), {
			found: true,
			value: 1,
		});
	});

	test("uses the same database lock for equivalent operation identifiers", async (context) => {
		const { store, pool } = await fixture(context);
		const operationId = "42c26729-670f-4c77-b218-dfb0820ad912";
		const connectionFor = pool.connect.bind(pool);
		const locks: unknown[] = [];
		context.mock.method(pool, "connect", async () => {
			const connection = await connectionFor();
			const query = connection.query.bind(connection);
			return {
				query: async (text: string, values?: unknown[]) => {
					if (
						text.includes("pg_advisory_xact_lock") &&
						values?.length
					)
						locks.push(values[0]);
					return query(text, values);
				},
				release: () => connection.release(),
			};
		});
		assert.equal(await store.increment("hits", operationId), 1);
		assert.equal(
			await store.increment("hits", operationId.toUpperCase()),
			1,
		);
		assert.deepEqual(locks, [operationId, operationId]);
		assert.deepEqual(await store.read("hits"), { found: true, value: 1 });
	});

	test("initializes counters and deduplicates repeated operations across service instances", async (context) => {
		const { store, pool } = await fixture(context);
		const operation = "42c26729-670f-4c77-b218-dfb0820ad912";
		assert.equal(await store.increment("hits", operation), 1);
		const replacement = new PostgresStorage(pool);
		assert.equal(await replacement.increment("hits", operation), 1);
		assert.equal(
			await replacement.increment(
				"hits",
				"24c26729-670f-4c77-b218-dfb0820ad912",
			),
			2,
		);
		assert.deepEqual(await store.read("hits"), { found: true, value: 2 });
		await assert.rejects(
			store.increment("other", operation),
			StorageConflict,
		);
		await pool.query(
			"UPDATE key_value.operations SET expires_at = now() - interval '1 second'",
		);
		await store.removeExpiredOperations();
		assert.equal(await store.increment("hits", operation), 3);
	});

	test("rejects incompatible existing values and overflow without leaving a transaction open", async (context) => {
		const { store, pool } = await fixture(context);
		for (const value of ["1", null, {}, 1.5, Number.MAX_SAFE_INTEGER, -1]) {
			await seed(pool, "invalid", value);
			await assert.rejects(
				store.increment("invalid", crypto.randomUUID()),
				StorageConflict,
			);
		}
		assert.equal(await store.increment("valid", crypto.randomUUID()), 1);
	});
});

suite("Authenticated storage service", () => {
	test("accepts the documented key lengths and rejects larger keys", async (context) => {
		const { store } = await fixture(context);
		const app = createApplication(store, "secret");
		context.after(() => app.close());
		const headers = { authorization: "Bearer secret" };
		for (const key of [
			"a".repeat(101),
			"a".repeat(512),
			"文".repeat(512),
			"🚀".repeat(512),
		]) {
			const url = `/v1/entries/${encodeURIComponent(key)}`;
			const increment = await app.inject({
				method: "POST",
				url: `${url}/increment`,
				headers,
				payload: { operationId: crypto.randomUUID() },
			});
			assert.equal(increment.statusCode, 200);
			assert.deepEqual(increment.json(), { value: 1 });
			assert.deepEqual((await app.inject({ url, headers })).json(), {
				found: true,
				value: 1,
			});
		}
		for (const key of [
			"a".repeat(513),
			"文".repeat(513),
			"🚀".repeat(513),
		]) {
			const url = `/v1/entries/${encodeURIComponent(key)}`;
			for (const method of ["GET", "POST"] as const) {
				const response = await app.inject({
					method,
					url: method === "GET" ? url : `${url}/increment`,
					headers,
					...(method === "POST"
						? { payload: { operationId: crypto.randomUUID() } }
						: {}),
				});
				assert.ok([400, 414].includes(response.statusCode));
			}
		}
	});

	test("authenticates before parsing bodies and keeps readiness public", async (context) => {
		const forbidden = async () => {
			assert.fail("Unauthenticated requests must not reach storage");
		};
		const app = createApplication(
			{ read: forbidden, increment: forbidden, check: async () => {} },
			"secret",
		);
		context.after(() => app.close());
		assert.equal(
			(await app.inject({ url: "/health/ready" })).statusCode,
			200,
		);
		for (const authorization of [
			undefined,
			"Basic c2VjcmV0",
			"Bearer",
			"Bearer wrong",
			"Bearer SECRET",
		]) {
			const response = await app.inject({
				method: "POST",
				url: "/v1/entries/hits/increment",
				headers: {
					"content-type": "application/json",
					...(authorization ? { authorization } : {}),
				},
				payload: "{",
			});
			assert.equal(response.statusCode, 401);
			assert.deepEqual(response.json(), { error: "Unauthorized" });
			assert.doesNotMatch(response.body, /secret|Basic|Bearer/);
		}
		assert.equal(
			(await app.inject({ url: "/v1/entries/hits?token=secret" }))
				.statusCode,
			401,
		);
	});
	test("exposes only read and increment operations", async (context) => {
		const { store } = await fixture(context);
		const app = createApplication(store, "secret-token");
		context.after(() => app.close());
		const headers = { authorization: "Bearer secret-token" };
		assert.equal(
			(await app.inject({ url: "/health/ready" })).statusCode,
			200,
		);
		assert.equal(
			(await app.inject({ url: "/v1/entries/hits" })).statusCode,
			401,
		);
		assert.equal(
			(
				await app.inject({
					url: "/v1/entries/hits",
					headers: { authorization: "Bearer wrong" },
				})
			).statusCode,
			401,
		);
		assert.deepEqual(
			(await app.inject({ url: "/v1/entries/missing", headers })).json(),
			{ found: false },
		);
		const operationId = crypto.randomUUID();
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await app.inject({
				method: "POST",
				url: "/v1/entries/hits%3Apage%3A%2F/increment",
				headers,
				payload: { operationId },
			});
			assert.deepEqual(response.json(), { value: 1 });
			assert.equal(
				response.headers["cache-control"],
				"private, no-store",
			);
		}
		assert.deepEqual(
			(
				await app.inject({
					url: "/v1/entries/hits%3Apage%3A%2F",
					headers,
				})
			).json(),
			{ found: true, value: 1 },
		);
		const unicode = await app.inject({
			method: "POST",
			url: "/v1/entries/unicode%3A%E6%96%87/increment",
			headers,
			payload: { operationId: crypto.randomUUID() },
		});
		assert.equal(unicode.statusCode, 200);
		assert.deepEqual(unicode.json(), { value: 1 });
		for (const method of ["PUT", "DELETE"] as const) {
			assert.equal(
				(
					await app.inject({
						method,
						url: "/v1/entries/hits%3Apage%3A%2F",
						headers,
					})
				).statusCode,
				404,
			);
		}
		assert.deepEqual(
			(
				await app.inject({
					url: "/v1/entries/hits%3Apage%3A%2F",
					headers,
				})
			).json(),
			{ found: true, value: 1 },
		);
		assert.equal(
			(
				await app.inject({
					method: "POST",
					url: "/v1/entries/hits/increment",
					headers,
					payload: { operationId: "invalid" },
				})
			).statusCode,
			400,
		);
		assert.equal(
			(
				await app.inject({
					method: "POST",
					url: "/v1/entries/hits/increment",
					headers,
					payload: {},
				})
			).statusCode,
			400,
		);
		assert.equal(
			(
				await app.inject({
					method: "POST",
					url: "/v1/entries/other/increment",
					headers,
					payload: { operationId },
				})
			).statusCode,
			409,
		);
		assert.equal(
			(
				await app.inject({
					method: "POST",
					url: "/v1/entries/hits/increment",
					headers,
					payload: { operationId: "x".repeat(70000) },
				})
			).statusCode,
			413,
		);
	});

	test("returns sanitized errors and readiness failure when storage is unavailable", async (context) => {
		const failure = async () => {
			throw new Error(
				"postgres://password@private-host visitor=203.0.113.7",
			);
		};
		const store = { read: failure, increment: failure, check: failure };
		const app = createApplication(store, "secret");
		context.after(() => app.close());
		for (const url of ["/health/ready", "/v1/entries/example"]) {
			const liveness = await app.inject({ url: "/health/live" });
			assert.equal(liveness.statusCode, 200);
			assert.deepEqual(liveness.json(), { live: true });
			const response = await app.inject({
				url,
				headers: { authorization: "Bearer secret" },
			});
			assert.equal(response.statusCode, 503);
			assert.doesNotMatch(
				response.body,
				/password|private-host|203\.0\.113\.7/,
			);
		}
		assert.throws(() => createApplication(store, ""));
	});

	test("drains in-flight operations during shutdown", async (context) => {
		let release!: () => void;
		let started!: () => void;
		const waiting = new Promise<void>((resolve) => {
			started = resolve;
		});
		const pending = new Promise<void>((resolve) => {
			release = resolve;
		});
		const store = {
			read: async () => {
				started();
				await pending;
				return { found: true as const, value: 5 };
			},
			increment: async () => 1,
			check: async () => {},
		};
		const app = createApplication(store, "secret");
		context.after(() => app.close());
		const response = app
			.inject({
				url: "/v1/entries/example",
				headers: { authorization: "Bearer secret" },
			})
			.then((value) => value);
		await waiting;
		const closing = app.close();
		release();
		assert.equal((await response).statusCode, 200);
		await closing;
	});
});
