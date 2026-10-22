import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { FeedbackTotals, Feedback } from "../src/domain/feedback.ts";
import type {
	PersistentStorage,
	StoredEntry,
} from "../src/domain/persistent-storage.ts";

suite("Feedback", () => {
	test("withdraws reactions independently through signed counter adjustments", async () => {
		const values = new Map<string, number>();
		const adjustments: number[] = [];
		const feedback = new Feedback("item:toggle", {
			read: async (key) => ({ found: true, value: values.get(key) ?? 0 }),
			increment: async (key, _operationId, amount = 1) => {
				adjustments.push(amount);
				const value = (values.get(key) ?? 0) + amount;
				values.set(key, value);
				return value;
			},
		});
		await feedback.record("like", crypto.randomUUID());
		await feedback.record("dislike", crypto.randomUUID());
		assert.deepEqual(await feedback.read(), new FeedbackTotals(1, 1));
		await feedback.record("like", crypto.randomUUID(), false);
		assert.deepEqual(await feedback.read(), new FeedbackTotals(0, 1));
		await feedback.record("dislike", crypto.randomUUID(), false);
		assert.deepEqual(await feedback.read(), new FeedbackTotals(0, 0));
		assert.deepEqual(adjustments, [1, 1, -1, -1]);
		await assert.rejects(
			feedback.record(
				"like",
				crypto.randomUUID(),
				"no" as unknown as boolean,
			),
			TypeError,
		);
	});
	test("derives signed net scores from nonnegative whole counts", () => {
		for (const [likes, dislikes, score, text] of [
			[12, 2, 10, "+10"],
			[2, 12, -10, "-10"],
			[0, 0, 0, "0"],
		] as const) {
			const totals = new FeedbackTotals(likes, dislikes);
			assert.equal(totals.score, score);
			assert.equal(totals.scoreText, text);
			assert.deepEqual(FeedbackTotals.from({ likes, dislikes }), totals);
		}
		for (const value of [
			null,
			1,
			{},
			{ likes: "1", dislikes: 0 },
			{ likes: 1, dislikes: -1 },
		])
			assert.throws(() => FeedbackTotals.from(value), TypeError);
		for (const value of [
			-1,
			1.5,
			NaN,
			Infinity,
			Number.MAX_SAFE_INTEGER + 1,
		]) {
			assert.throws(() => new FeedbackTotals(value, 0), TypeError);
			assert.throws(() => new FeedbackTotals(0, value), TypeError);
		}
	});
	test("reads aggregate totals and records votes with retry-safe operation identifiers", async () => {
		const values = new Map<string, number>();
		const operations = new Set<string>();
		const calls: unknown[] = [];
		const storage: PersistentStorage = {
			read: async (key) =>
				values.has(key)
					? { found: true, value: values.get(key)! }
					: { found: false },
			increment: async (key, operationId) => {
				calls.push([key, operationId]);
				if (!operations.has(operationId)) {
					values.set(key, (values.get(key) ?? 0) + 1);
					operations.add(operationId);
				}
				return values.get(key)!;
			},
		};
		const feedback = new Feedback("/blog/example", storage);
		assert.deepEqual(await feedback.read(), new FeedbackTotals(0, 0));
		const operationId = crypto.randomUUID();
		assert.deepEqual(
			await feedback.record("like", operationId),
			new FeedbackTotals(1, 0),
		);
		assert.deepEqual(
			await feedback.record("like", operationId),
			new FeedbackTotals(1, 0),
		);
		assert.deepEqual(
			await feedback.record("dislike", crypto.randomUUID()),
			new FeedbackTotals(1, 1),
		);
		assert.equal((calls[0] as string[])[0], "likes:/blog/example");
		assert.equal((calls[2] as string[])[0], "dislikes:/blog/example");
		await assert.rejects(
			feedback.record("other" as "like", crypto.randomUUID()),
			TypeError,
		);
	});
	test("keeps independent feedback for different subjects", async () => {
		const values = new Map<string, number>();
		const storage: PersistentStorage = {
			read: async (key) =>
				values.has(key)
					? { found: true, value: values.get(key)! }
					: { found: false },
			increment: async (key) => {
				const value = (values.get(key) ?? 0) + 1;
				values.set(key, value);
				return value;
			},
		};
		const first = new Feedback("item:example:first", storage);
		const second = new Feedback("item:example:second", storage);
		await first.record("like", crypto.randomUUID());
		await second.record("dislike", crypto.randomUUID());
		assert.deepEqual(await first.read(), new FeedbackTotals(1, 0));
		assert.deepEqual(await second.read(), new FeedbackTotals(0, 1));
		assert.equal(values.get("likes:item:example:first"), 1);
	});

	test("rejects invalid objects and surfaces service failures without inventing zero totals", async () => {
		const storage: PersistentStorage = {
			read: async () => {
				throw new Error("offline");
			},
			increment: async () => {
				throw new Error("offline");
			},
		};
		for (const path of [
			null,
			"",
			" leading-space",
			"trailing-space ",
			"\t",
			"/" + "x".repeat(500),
			"/\n",
		])
			assert.throws(
				() => new Feedback(path as string, storage),
				TypeError,
			);
		for (const invalid of [
			null,
			{},
			{ read: async () => ({ found: false }) },
		])
			assert.throws(
				() =>
					new Feedback("/", invalid as unknown as PersistentStorage),
				TypeError,
			);
		const feedback = new Feedback("/", storage);
		await assert.rejects(feedback.read());
		await assert.rejects(feedback.record("like", crypto.randomUUID()));
		const invalid = new Feedback("/", {
			...storage,
			read: async () =>
				({ found: true, value: "not a count" }) as StoredEntry,
		});
		await assert.rejects(invalid.read(), TypeError);
	});
});
