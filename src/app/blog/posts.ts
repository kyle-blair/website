import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({ html: false });
const postsDirectory = path.join(process.cwd(), "src/app/blog");

function plainText(tokens: ReturnType<typeof markdown.parse>): string {
	return tokens
		.map((token) => {
			if (token.children) return plainText(token.children);
			if (token.type === "softbreak" || token.type === "hardbreak")
				return " ";
			return token.nesting === 0 ? token.content : "";
		})
		.join("");
}

export async function getPosts(directory = postsDirectory) {
	const files = await readdir(directory, { withFileTypes: true });
	const posts = await Promise.all(
		files
			.filter((file) => file.isFile() && file.name.endsWith(".md"))
			.map(async (file) => {
				const source = await readFile(
					path.join(directory, file.name),
					"utf8",
				);
				const tokens = markdown.parse(source, {});
				const headings = tokens.filter(
					(token) =>
						token.type === "heading_open" && token.tag === "h1",
				);
				if (
					tokens[0]?.type !== "heading_open" ||
					tokens[0].tag !== "h1" ||
					headings.length !== 1
				) {
					throw new Error(
						`${file.name}: start the post with one primary heading (# Title). Use ## for sections.`,
					);
				}
				const title = plainText(tokens[1].children ?? []).trim();
				const slug = title
					.normalize("NFKD")
					.replace(/\p{M}/gu, "")
					.toLowerCase()
					.replace(/[^\p{L}\p{N}]+/gu, "-")
					.replace(/^-+|-+$/g, "");
				if (!slug)
					throw new Error(
						`${file.name}: the title must contain letters or numbers.`,
					);
				let date: string | undefined;
				const dateLine =
					tokens[3]?.type === "paragraph_open"
						? tokens[4]?.content
						: undefined;
				if (dateLine?.startsWith("Date:")) {
					const match = /^Date:\s*(\d{4}-\d{2}-\d{2})$/.exec(
						dateLine.trim(),
					);
					const parsedDate = match
						? new Date(match[1])
						: new Date(NaN);
					if (
						!match ||
						Number.isNaN(parsedDate.getTime()) ||
						parsedDate.toISOString().slice(0, 10) !== match[1]
					) {
						throw new Error(
							`${file.name}: use a valid calendar date in the form Date: YYYY-MM-DD below the title.`,
						);
					}
					date = match[1];
				}
				return {
					title,
					slug,
					date,
					// The page renders the title and date above the remaining body.
					body: markdown.renderer.render(
						tokens.slice(date ? 6 : 3),
						markdown.options,
						{},
					),
				};
			}),
	);
	const slugs = new Set<string>();
	for (const post of posts) {
		if (slugs.has(post.slug)) {
			throw new Error(
				`Multiple post titles produce /blog/${post.slug}. Give each post a distinct title.`,
			);
		}
		slugs.add(post.slug);
	}
	return posts.sort(
		(first, second) =>
			(second.date ?? "").localeCompare(first.date ?? "") ||
			first.title.localeCompare(second.title),
	);
}

export async function getPost(slug: string) {
	return (await getPosts()).find((post) => post.slug === slug);
}

export function formatPostDate(date: string) {
	return date;
}
