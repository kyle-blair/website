type PageVisit = {
	operationId: string;
	createdAt: number;
	confirmed: boolean;
};

const duration = 10 * 60 * 1000;
const prefix = "page-visit:";

function readVisit(value: string | null, now: number): PageVisit | undefined {
	try {
		const visit = JSON.parse(value ?? "null");
		if (
			typeof visit?.operationId === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
				visit.operationId,
			) &&
			Number.isSafeInteger(visit.createdAt) &&
			visit.createdAt <= now &&
			now - visit.createdAt < duration &&
			typeof visit.confirmed === "boolean"
		)
			return visit;
	} catch {}
	return undefined;
}

async function requestCount(
	path: string,
	signal: AbortSignal,
	operationId?: string,
): Promise<number> {
	const response = await fetch(
		operationId
			? "/api/page-hits"
			: `/api/page-hits?path=${encodeURIComponent(path)}`,
		{
			...(operationId
				? {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ path, operationId }),
					}
				: { method: "GET" }),
			cache: "no-store",
			signal,
		},
	);
	if (!response.ok) throw new Error("Page count unavailable");
	const result = await response.json();
	if (!Number.isSafeInteger(result?.count) || result.count < 0)
		throw new Error("Invalid page count");
	return result.count;
}

export async function readPageHitCount(
	path: string,
	signal: AbortSignal,
): Promise<number> {
	if (!window.navigator.locks) return requestCount(path, signal);
	return window.navigator.locks.request(
		"page-visits",
		{ signal },
		async () => {
			const key = `${prefix}${path}`;
			let storage: Storage;
			let visit: PageVisit;
			try {
				storage = window.localStorage;
				const now = Date.now();
				for (const storedKey of Object.keys(storage)) {
					if (
						storedKey.startsWith(prefix) &&
						!readVisit(storage.getItem(storedKey), now)
					)
						storage.removeItem(storedKey);
				}
				const previous = readVisit(storage.getItem(key), now);
				visit = previous ?? {
					operationId: crypto.randomUUID(),
					createdAt: now,
					confirmed: false,
				};
				if (!previous) storage.setItem(key, JSON.stringify(visit));
			} catch {
				return requestCount(path, signal);
			}
			if (visit.confirmed) return requestCount(path, signal);
			const count = await requestCount(path, signal, visit.operationId);
			try {
				storage.setItem(
					key,
					JSON.stringify({ ...visit, confirmed: true }),
				);
			} catch {}
			return count;
		},
	);
}
