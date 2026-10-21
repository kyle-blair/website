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
		const site = request.headers.get("sec-fetch-site");
		if (site !== null && site !== "same-origin") {
			return this.response({ error: "Cross-site request rejected" }, 403);
		}
		const origin = request.headers.get("origin");
		if (site === null && origin !== null) {
			try {
				const source = new URL(origin);
				const host =
					request.headers.get("host") ?? new URL(request.url).host;
				if (
					(source.protocol !== "https:" &&
						source.protocol !== "http:") ||
					source.host !== host.toLowerCase()
				) {
					return this.response(
						{ error: "Cross-site request rejected" },
						403,
					);
				}
			} catch {
				return this.response(
					{ error: "Cross-site request rejected" },
					403,
				);
			}
		}
		if (
			request.headers
				.get("content-type")
				?.split(";")[0]
				.trim()
				.toLowerCase() !== "application/json"
		) {
			return this.response({ error: "JSON is required" }, 415);
		}
		let path: string;
		let operationId: string;
		try {
			const reader = request.body?.getReader();
			if (!reader) {
				return this.response({ error: "Invalid page view" }, 400);
			}
			const body = new Uint8Array(8192);
			let size = 0;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value.byteLength > body.byteLength - size) {
						void reader.cancel().catch(() => {});
						return this.response(
							{ error: "Request body too large" },
							413,
						);
					}
					body.set(value, size);
					size += value.byteLength;
				}
			} finally {
				reader.releaseLock();
			}
			const submission = JSON.parse(
				new TextDecoder().decode(body.subarray(0, size)),
			);
			if (
				typeof submission !== "object" ||
				submission === null ||
				typeof submission.path !== "string" ||
				submission.path.length > 4096 ||
				typeof submission.operationId !== "string" ||
				!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
					submission.operationId,
				)
			) {
				return this.response({ error: "Invalid page view" }, 400);
			}
			path = decodeURIComponent(submission.path);
			operationId = submission.operationId;
			if (path.length > 500) {
				return this.response({ error: "Invalid page view" }, 400);
			}
		} catch {
			return this.response({ error: "Invalid page view" }, 400);
		}
		try {
			if (!(await this.isPublishedPage(path))) {
				return this.response({ error: "Invalid page view" }, 400);
			}
			const count = await this.increment(
				`hits:page:${path}`,
				operationId,
			);
			return this.response({ count }, 200);
		} catch {
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
