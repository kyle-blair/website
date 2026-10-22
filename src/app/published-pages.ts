import { getPosts } from "./blog/posts.ts";

export async function isPublishedPage(path: string) {
	return (
		["/", "/blog", "/contact"].includes(path) ||
		(await getPosts()).some((post) => path === `/blog/${post.slug}`)
	);
}
