import type { CounterStore } from "../../../domain/counter-store.ts";
import { Feedback } from "../../../domain/feedback.ts";
import { RequestRejection, Submission } from "../submission.ts";

export class FeedbackEndpoint {
	private readonly counters: CounterStore;

	public constructor(counters: CounterStore) {
		this.counters = counters;
	}

	public async read(request: Request): Promise<Response> {
		const subject = new URL(request.url).searchParams.get("subject");
		if (!Feedback.isValidSubject(subject))
			return this.response({ error: "Invalid feedback" }, 400);
		try {
			return this.response(
				await new Feedback(subject, this.counters).read(),
				200,
			);
		} catch {
			return this.response({ error: "Feedback unavailable" }, 503);
		}
	}

	public async record(request: Request): Promise<Response> {
		try {
			const action = await Submission.fromRequest(
				request,
				"Invalid feedback",
			);
			const { subject, reaction, selected = true } = action.data;
			if (
				!Feedback.isValidSubject(subject) ||
				(reaction !== "like" && reaction !== "dislike") ||
				typeof selected !== "boolean"
			)
				return this.response({ error: "Invalid feedback" }, 400);
			return this.response(
				await new Feedback(subject, this.counters).record(
					reaction,
					action.operationId,
					selected,
				),
				200,
			);
		} catch (error) {
			if (error instanceof RequestRejection)
				return this.response({ error: error.message }, error.status);
			return this.response({ error: "Feedback unavailable" }, 503);
		}
	}

	private response(body: object, status: number): Response {
		return Response.json(body, {
			status,
			headers: { "Cache-Control": "private, no-store" },
		});
	}
}
