import { Feedback } from "../../../domain/feedback.ts";
import { HttpsStorage } from "../../../infrastructure/https-storage.ts";
import { Submission, RequestRejection } from "../submission.ts";
import { observe } from "../../../../shared/telemetry.ts";

function feedback(subject: string) {
	return new Feedback(
		subject,
		new HttpsStorage(
			process.env.STORAGE_SERVICE_URL ?? "",
			process.env.STORAGE_SERVICE_TOKEN ?? "",
			fetch,
			process.env.STORAGE_ALLOW_HTTP === "true",
		),
	);
}
function response(body: object, status: number) {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "private, no-store" },
	});
}

export async function GET(request: Request) {
	return observe("feedback.read", async () => {
		const subject = new URL(request.url).searchParams.get("subject");
		if (!Feedback.isValidSubject(subject))
			return response({ error: "Invalid feedback" }, 400);
		try {
			return response(await feedback(subject).read(), 200);
		} catch {
			return response({ error: "Feedback unavailable" }, 503);
		}
	});
}

export async function POST(request: Request) {
	return observe("feedback.record", async () => {
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
				return response({ error: "Invalid feedback" }, 400);
			return response(
				await feedback(subject).record(
					reaction,
					action.operationId,
					selected,
				),
				200,
			);
		} catch (error) {
			if (error instanceof RequestRejection)
				return response({ error: error.message }, error.status);
			return response({ error: "Feedback unavailable" }, 503);
		}
	});
}
