import { Submission, RequestRejection } from "../submission.ts";
import type { CounterStore } from "../../../domain/counter-store.ts";

export class PageHitsEndpoint {
	private readonly counters: CounterStore;
	private readonly isPublishedPage: (path: string) => Promise<boolean>;
	public constructor(
		counters: CounterStore,
		isPublishedPage: (path: string) => Promise<boolean>,
	) {
		this.counters = counters;
		this.isPublishedPage = isPublishedPage;
	}

	public async read(request: Request): Promise<Response> {
		const submittedPath = new URL(request.url).searchParams.get("path");
		if (submittedPath === null || submittedPath.length > 4096)
			return this.response({ error: "Invalid page view" }, 400);
		let path: string;
		try {
			path = decodeURIComponent(submittedPath);
		} catch {
			return this.response({ error: "Invalid page view" }, 400);
		}
		try {
			if (path.length > 500 || !(await this.isPublishedPage(path)))
				return this.response({ error: "Invalid page view" }, 400);
			const count = await this.counters.read(`hits:page:${path}`);
			if (!Number.isSafeInteger(count) || count < 0)
				throw new Error(
					"The counter store returned an invalid page count.",
				);
			return this.response({ count }, 200);
		} catch {
			return this.response({ error: "Page count unavailable" }, 503);
		}
	}

	public async record(request: Request): Promise<Response> {
		try {
			const action = await Submission.fromRequest(
				request,
				"Invalid page view",
			);
			const submittedPath = action.data.path;
			if (
				typeof submittedPath !== "string" ||
				submittedPath.length > 4096
			)
				return this.response({ error: "Invalid page view" }, 400);
			let path: string;
			try {
				path = decodeURIComponent(submittedPath);
			} catch {
				return this.response({ error: "Invalid page view" }, 400);
			}
			if (path.length > 500 || !(await this.isPublishedPage(path)))
				return this.response({ error: "Invalid page view" }, 400);
			const count = await this.counters.adjust(
				`hits:page:${path}`,
				action.operationId,
				1,
			);
			return this.response({ count }, 200);
		} catch (error) {
			if (error instanceof RequestRejection)
				return this.response({ error: error.message }, error.status);
			return this.response({ error: "Page count unavailable" }, 503);
		}
	}
	private response(body: object, status: number): Response {
		return Response.json(body, {
			status,
			headers: { "Cache-Control": "private, no-store" },
		});
	}
}
