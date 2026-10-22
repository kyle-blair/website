import { PageHitsEndpoint } from "./page-hits-endpoint.ts";
import { HttpsStorage } from "../../../infrastructure/https-storage.ts";
import { isPublishedPage } from "../../published-pages.ts";
import { observe } from "../../../../shared/telemetry.ts";

export async function POST(request: Request) {
	return observe("page_views.record", async () => {
		const endpoint = new PageHitsEndpoint(async (key, operationId) => {
			const store = new HttpsStorage(
				process.env.STORAGE_SERVICE_URL ?? "",
				process.env.STORAGE_SERVICE_TOKEN ?? "",
				fetch,
				process.env.STORAGE_ALLOW_HTTP === "true",
			);
			return store.increment(key, operationId);
		}, isPublishedPage);
		return endpoint.handle(request);
	});
}

export async function GET(request: Request) {
	return observe("page_views.read", async () => {
		const submittedPath = new URL(request.url).searchParams.get("path");
		const response = (body: object, status: number) =>
			Response.json(body, {
				status,
				headers: { "Cache-Control": "private, no-store" },
			});
		if (submittedPath === null || submittedPath.length > 4096)
			return response({ error: "Invalid page view" }, 400);
		let path: string;
		try {
			path = decodeURIComponent(submittedPath);
		} catch {
			return response({ error: "Invalid page view" }, 400);
		}
		try {
			if (path.length > 500 || !(await isPublishedPage(path)))
				return response({ error: "Invalid page view" }, 400);
			const store = new HttpsStorage(
				process.env.STORAGE_SERVICE_URL ?? "",
				process.env.STORAGE_SERVICE_TOKEN ?? "",
				fetch,
				process.env.STORAGE_ALLOW_HTTP === "true",
			);
			const entry = await store.read(`hits:page:${path}`);
			const count = entry.found ? entry.value : 0;
			if (!Number.isSafeInteger(count) || (count as number) < 0)
				throw new Error("Invalid page count");
			return response({ count }, 200);
		} catch {
			return response({ error: "Page count unavailable" }, 503);
		}
	});
}
