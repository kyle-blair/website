import assert from "node:assert/strict";

const origin = new URL(process.env.STORAGE_SERVICE_URL ?? "");
const token = process.env.STORAGE_SERVICE_TOKEN;
assert.ok(token, "STORAGE_SERVICE_TOKEN is required");

export function storageRequest(path: string, options: RequestInit = {}) {
	const headers = new Headers(options.headers);
	if (!headers.has("authorization")) {
		headers.set("authorization", `Bearer ${token}`);
	}
	return fetch(new URL(path, origin), {
		...options,
		headers,
		signal: AbortSignal.timeout(5000),
	});
}

export function increment(key: string, operationId: string, amount = 1) {
	return storageRequest(
		`/v1/entries/${encodeURIComponent(key)}/${amount === 1 ? "increment" : "decrement"}`,
		{
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ operationId }),
		},
	);
}

export async function readCount(key: string): Promise<number> {
	const response = await storageRequest(
		`/v1/entries/${encodeURIComponent(key)}`,
	);
	assert.equal(response.status, 200);
	const entry = await response.json();
	if (entry.found === false) return 0;
	assert.equal(entry.found, true);
	assert.ok(Number.isSafeInteger(entry.value) && entry.value >= 0);
	return entry.value;
}
