import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { increment, readCount, storageRequest } from "./storage.ts";

suite("Storage service with PostgreSQL containers", { timeout: 30000 }, () => {
	test("starts each integration run with fresh database state", async () => {
		const key = "integration:run-isolation";
		assert.equal(await readCount(key), 0);
		const response = await increment(key, crypto.randomUUID());
		assert.equal(response.status, 200);
		assert.deepEqual(await response.json(), { value: 1 });
	});

	test("keeps readiness public and rejects unauthenticated requests before parsing bodies", async () => {
		const health = await storageRequest("/health/ready", {
			headers: { authorization: "" },
		});
		assert.equal(health.status, 200);
		assert.deepEqual(await health.json(), { ready: true });
		for (const authorization of ["", "Basic c2VjcmV0", "Bearer wrong"]) {
			const response = await storageRequest(
				"/v1/entries/hits/increment",
				{
					method: "POST",
					headers: {
						authorization,
						"content-type": "application/json",
					},
					body: "{",
				},
			);
			assert.equal(response.status, 401);
			assert.deepEqual(await response.json(), { error: "Unauthorized" });
		}
	});

	test("persists increments and returns the original result for retries", async () => {
		const key = `integration:${crypto.randomUUID()}`;
		assert.equal(await readCount(key), 0);
		const operationId = crypto.randomUUID();
		for (let attempt = 0; attempt < 2; attempt++) {
			const response = await increment(key, operationId);
			assert.equal(response.status, 200);
			assert.equal(
				response.headers.get("cache-control"),
				"private, no-store",
			);
			assert.deepEqual(await response.json(), { value: 1 });
		}
		assert.equal(await readCount(key), 1);
		const conflict = await increment(`other:${key}`, operationId);
		assert.equal(conflict.status, 409);
		assert.equal(await readCount(`other:${key}`), 0);
	});

	test("accepts 512-character keys and rejects larger keys over the network", async () => {
		for (const character of ["a", "文", "🚀"]) {
			const key = `${crypto.randomUUID()}:${character.repeat(475)}`;
			const response = await increment(key, crypto.randomUUID());
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { value: 1 });
			assert.equal(await readCount(key), 1);
			const rejected = await increment(
				`${key}${character}`,
				crypto.randomUUID(),
			);
			assert.ok([400, 414].includes(rejected.status));
			assert.equal(await readCount(key), 1);
		}
	});

	test("withdraws counts once across concurrent retries and rejects conflicting adjustments", async () => {
		const key = `integration:${crypto.randomUUID()}`;
		assert.equal((await increment(key, crypto.randomUUID())).status, 200);
		const operationId = crypto.randomUUID();
		const responses = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				increment(
					key,
					index % 2 === 0 ? operationId : operationId.toUpperCase(),
					-1,
				),
			),
		);
		for (const response of responses) {
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { value: 0 });
		}
		assert.equal((await increment(key, operationId, 1)).status, 409);
		assert.equal(
			(await increment(key, crypto.randomUUID(), -1)).status,
			409,
		);
		assert.equal(await readCount(key), 0);
	});

	test("deduplicates mixed-case identifiers across concurrent database connections", async () => {
		const key = `integration:${crypto.randomUUID()}`;
		const operationId = `a${crypto.randomUUID().slice(1)}`;
		const responses = await Promise.all(
			Array.from({ length: 20 }, (_, index) =>
				increment(
					key,
					index % 2 === 0 ? operationId : operationId.toUpperCase(),
				),
			),
		);
		for (const response of responses) {
			assert.equal(response.status, 200);
			assert.deepEqual(await response.json(), { value: 1 });
		}
		assert.equal(await readCount(key), 1);
	});

	test("preserves every distinct concurrent increment", async () => {
		const key = `integration:${crypto.randomUUID()}`;
		const responses = await Promise.all(
			Array.from({ length: 30 }, () =>
				increment(key, crypto.randomUUID()),
			),
		);
		const values = [];
		for (const response of responses) {
			assert.equal(response.status, 200);
			values.push((await response.json()).value);
		}
		assert.deepEqual(
			values.sort((left, right) => left - right),
			Array.from({ length: 30 }, (_, index) => index + 1),
		);
		assert.equal(await readCount(key), 30);
	});
});
