import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { suite, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PostgreSQLCounterStore } from "../src/infrastructure/postgresql-counter-store.ts";
import {
	CounterAdjustmentConflict,
	type DatabasePool,
} from "../src/infrastructure/postgresql-counter-store.ts";

async function fixture(context: {
	after: (callback: () => Promise<void>) => void;
}) {
	const database = new PGlite();
	const pool: DatabasePool = {
		query: async (text, values) => database.query(text, values),
		connect: async () => ({
			query: async (text, values) => database.query(text, values),
			release() {},
		}),
	};
	const schema = await readFile(
		new URL("../database/schema.sql", import.meta.url),
		"utf8",
	);
	await database.exec(schema);
	context.after(() => database.close());
	return { pool, store: new PostgreSQLCounterStore(pool) };
}

suite("PostgreSQL counter store", () => {
	test("reads a missing counter as zero", async () => {
		const store = new PostgreSQLCounterStore({
			query: async () => ({ rows: [] }),
			connect: async () => {
				throw new Error("A read must not start a transaction.");
			},
		});

		assert.equal(await store.read("hits:page:/"), 0);
	});

	test("adjusts counters atomically and returns the original result for retries", async (context) => {
		const { store } = await fixture(context);
		const firstOperation = crypto.randomUUID();
		assert.equal(
			await store.adjust("reactions:item", firstOperation, 1),
			1,
		);
		assert.equal(
			await store.adjust(
				"reactions:item",
				firstOperation.toUpperCase(),
				1,
			),
			1,
		);
		assert.equal(await store.read("reactions:item"), 1);

		const withdrawal = crypto.randomUUID();
		assert.equal(await store.adjust("reactions:item", withdrawal, -1), 0);
		assert.equal(await store.adjust("reactions:item", withdrawal, -1), 0);
		await assert.rejects(
			store.adjust("reactions:item", withdrawal, 1),
			CounterAdjustmentConflict,
		);
		await assert.rejects(
			store.adjust("other:item", firstOperation, 1),
			CounterAdjustmentConflict,
		);
		await assert.rejects(
			store.adjust("reactions:item", crypto.randomUUID(), -1),
			CounterAdjustmentConflict,
		);
		await assert.rejects(
			store.adjust("missing", crypto.randomUUID(), -1),
			CounterAdjustmentConflict,
		);
		assert.equal(await store.read("reactions:item"), 0);
		assert.equal(await store.read("missing"), 0);
	});

	test("keeps retry records without an expiration window", async (context) => {
		const { pool, store } = await fixture(context);
		const operationId = crypto.randomUUID();
		assert.equal(await store.adjust("hits:page:/", operationId, 1), 1);
		const recorded = await pool.query(
			"SELECT operation_id, counter_name, amount, result FROM website.counter_adjustments",
		);
		assert.equal(recorded.rows.length, 1);
		assert.equal(recorded.rows[0].counter_name, "hits:page:/");
		assert.equal(Number(recorded.rows[0].amount), 1);
		assert.equal(Number(recorded.rows[0].result), 1);
		assert.equal(await store.adjust("hits:page:/", operationId, 1), 1);
	});

	test("rejects invalid names, identifiers, adjustments, and database values", async (context) => {
		const { store } = await fixture(context);
		for (const name of [
			42 as unknown as string,
			"",
			"x".repeat(513),
			"line\nbreak",
		])
			await assert.rejects(store.read(name), TypeError);
		await assert.rejects(store.adjust("hits", "invalid", 1), TypeError);
		await assert.rejects(
			store.adjust("hits", crypto.randomUUID(), 2 as 1),
			TypeError,
		);

		const invalid = new PostgreSQLCounterStore({
			query: async () => ({ rows: [{ value: "9007199254740992" }] }),
			connect: async () => {
				throw new Error(
					"An invalid read must not start a transaction.",
				);
			},
		});
		await assert.rejects(invalid.read("hits"), /supported range/);
		const negative = new PostgreSQLCounterStore({
			query: async () => ({ rows: [{ value: -1 }] }),
			connect: async () => {
				throw new Error(
					"An invalid read must not start a transaction.",
				);
			},
		});
		await assert.rejects(negative.read("hits"), /supported range/);
		const stringValue = new PostgreSQLCounterStore({
			query: async () => ({ rows: [{ value: "12" }] }),
			connect: async () => {
				throw new Error("A read must not start a transaction.");
			},
		});
		assert.equal(await stringValue.read("hits"), 12);
	});

	test("preserves the adjustment and rollback failures", async () => {
		const adjustmentFailure = new Error("Adjustment failed.");
		const rollbackFailure = new Error("Rollback failed.");
		let queries = 0;
		const store = new PostgreSQLCounterStore({
			query: async () => ({ rows: [] }),
			connect: async () => ({
				query: async (text) => {
					queries += 1;
					if (text === "BEGIN") return { rows: [] };
					if (text === "ROLLBACK") throw rollbackFailure;
					throw adjustmentFailure;
				},
				release() {},
			}),
		});
		await assert.rejects(
			store.adjust("hits", crypto.randomUUID(), 1),
			(error: AggregateError) => {
				assert.deepEqual(error.errors, [
					adjustmentFailure,
					rollbackFailure,
				]);
				return true;
			},
		);
		assert.equal(queries, 3);
	});
});
