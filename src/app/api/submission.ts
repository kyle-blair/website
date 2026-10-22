export class RequestRejection extends Error {
	public readonly status: number;
	public constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

export class Submission {
	public readonly operationId: string;
	public readonly data: Record<string, unknown>;
	private constructor(operationId: string, data: Record<string, unknown>) {
		this.operationId = operationId;
		this.data = data;
	}
	public static async fromRequest(
		request: Request,
		invalidMessage: string,
	): Promise<Submission> {
		const site = request.headers.get("sec-fetch-site");
		if (site !== null && site !== "same-origin")
			throw new RequestRejection(403, "Cross-site request rejected");
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
				)
					throw new Error("Cross-site request");
			} catch {
				throw new RequestRejection(403, "Cross-site request rejected");
			}
		}
		if (
			request.headers
				.get("content-type")
				?.split(";")[0]
				.trim()
				.toLowerCase() !== "application/json"
		)
			throw new RequestRejection(415, "JSON is required");
		try {
			const reader = request.body?.getReader();
			if (!reader) throw new RequestRejection(400, invalidMessage);
			const body = new Uint8Array(8192);
			let size = 0;
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					if (value.byteLength > body.byteLength - size) {
						void reader.cancel().catch(() => {});
						throw new RequestRejection(
							413,
							"Request body too large",
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
				typeof submission.operationId !== "string" ||
				!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(
					submission.operationId,
				)
			)
				throw new RequestRejection(400, invalidMessage);
			return new Submission(submission.operationId, submission);
		} catch (error) {
			if (error instanceof RequestRejection) throw error;
			throw new RequestRejection(400, invalidMessage);
		}
	}
}
