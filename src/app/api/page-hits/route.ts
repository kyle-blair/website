import { PageHitsEndpoint } from "./page-hits-endpoint.ts";
import { databaseCounterStore } from "../../../infrastructure/database-counter-store.ts";
import { isPublishedPage } from "../../published-pages.ts";
import { observe } from "../../../../shared/telemetry.ts";

const endpoint = new PageHitsEndpoint(databaseCounterStore, isPublishedPage);

export async function POST(request: Request) {
	return observe("page_views.record", () => endpoint.record(request));
}

export async function GET(request: Request) {
	return observe("page_views.read", () => endpoint.read(request));
}
