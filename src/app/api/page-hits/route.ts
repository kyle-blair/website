import { PageHitsEndpoint } from "./page-hits-endpoint.ts";
import { HttpsStorage } from "../../../infrastructure/https-storage.ts";
import { getPosts } from "../../blog/posts.ts";

export async function POST(request: Request) {
	const endpoint = new PageHitsEndpoint(
		async (key, operationId) => {
			const store = new HttpsStorage(
				process.env.STORAGE_SERVICE_URL ?? "",
				process.env.STORAGE_SERVICE_TOKEN ?? "",
				fetch,
				process.env.STORAGE_ALLOW_HTTP === "true",
			);
			return store.increment(key, operationId);
		},
		async (path) =>
			["/", "/blog", "/contact"].includes(path) ||
			(await getPosts()).some((post) => path === `/blog/${post.slug}`),
	);
	return endpoint.handle(request);
}
