import { Submission, RequestRejection } from "../submission.ts";

export class PageHitsEndpoint {
	private readonly increment: (
		key: string,
		operationId: string,
	) => Promise<number>;
	private readonly isPublishedPage: (path: string) => Promise<boolean>;
	public constructor(
		increment: (key: string, operationId: string) => Promise<number>,
		isPublishedPage: (path: string) => Promise<boolean>,
	) {
		this.increment = increment;
		this.isPublishedPage = isPublishedPage;
	}
	public async handle(request: Request): Promise<Response> {
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
			const count = await this.increment(
				`hits:page:${path}`,
				action.operationId,
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
