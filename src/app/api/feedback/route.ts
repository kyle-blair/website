import { databaseCounterStore } from "../../counters/database-counter-store.ts";
import { observe } from "../../telemetry/telemetry.ts";
import { FeedbackEndpoint } from "./feedback-endpoint.ts";

const endpoint = new FeedbackEndpoint(databaseCounterStore);

export async function GET(request: Request) {
	return observe("feedback.read", () => endpoint.read(request));
}

export async function POST(request: Request) {
	return observe("feedback.record", () => endpoint.record(request));
}
