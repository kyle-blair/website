import { staticPosts } from "./blog/posts.generated.ts";

const publishedPages = new Set([
	"/",
	"/blog",
	"/contact",
	...staticPosts.map((post) => `/blog/${post.getSlug()}`),
]);

export async function isPublishedPage(path: string) {
	return publishedPages.has(path);
}
