import type {
	PersistentStorage,
	StoredEntry,
} from "../domain/persistent-storage.ts";

export class HttpsStorage implements PersistentStorage {
	private readonly address: URL;
	private readonly token: string;
	private readonly fetcher: typeof fetch;

	public constructor(
		address: string,
		token: string,
		fetcher: typeof fetch = fetch,
		allowHttp = false,
	) {
		this.address = new URL(address);
		if (
			(this.address.protocol !== "https:" &&
				!(allowHttp && this.address.protocol === "http:")) ||
			this.address.username ||
			this.address.password ||
			this.address.search ||
			this.address.hash ||
			this.address.pathname !== "/" ||
			!token.trim()
		)
			throw new TypeError(
				"A storage service requires an HTTPS origin and a credential.",
			);
		this.token = token;
		this.fetcher = fetcher;
	}

	public async read(key: string): Promise<StoredEntry> {
		const response = await this.request(key, "GET");
		const entry = await response.json();
		if (
			typeof entry !== "object" ||
			entry === null ||
			(entry.found !== false &&
				!(entry.found === true && Object.hasOwn(entry, "value")))
		)
			throw new Error("Invalid storage response.");
		return entry;
	}

	public async increment(
		key: string,
		operationId: string,
		amount = 1,
	): Promise<number> {
		if (amount !== 1 && amount !== -1)
			throw new TypeError("Counter adjustments must be 1 or -1.");
		const response = await this.request(
			key,
			"POST",
			{ operationId },
			amount === 1 ? "/increment" : "/decrement",
		);
		const result = await response.json();
		if (!Number.isSafeInteger(result?.value) || result.value < 0)
			throw new Error("Invalid counter response.");
		return result.value;
	}

	private async request(
		key: string,
		method: string,
		body?: unknown,
		suffix = "",
	): Promise<Response> {
		const response = await this.fetcher(
			new URL(
				`/v1/entries/${encodeURIComponent(key)}${suffix}`,
				this.address,
			),
			{
				method,
				headers: {
					authorization: `Bearer ${this.token}`,
					"content-type": "application/json",
				},
				body: body === undefined ? undefined : JSON.stringify(body),
				cache: "no-store",
				redirect: "error",
				signal: AbortSignal.timeout(3000),
			},
		);
		if (!response.ok) throw new Error("Storage service unavailable.");
		return response;
	}
}
