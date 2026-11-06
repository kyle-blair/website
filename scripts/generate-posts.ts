import { readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt, { type Token } from "markdown-it";
import { format, resolveConfig } from "prettier";
import { Post } from "../src/app/blog/Post.ts";

const postModule = fileURLToPath(
	new URL("../src/app/blog/Post.ts", import.meta.url),
);
const postsDirectory = path.dirname(postModule);
const staticPostsFile = path.join(postsDirectory, "posts.generated.ts");
const markdown = new MarkdownIt({ html: false });

function plainText(tokens: Token[]): string {
	return tokens
		.map((token) => {
			if (token.children) return plainText(token.children);
			return token.nesting === 0 ? token.content : "";
		})
		.join("");
}

function parsePublicationDate(source: string | undefined): Date {
	const date = new Date(source ?? NaN);
	return source !== undefined &&
		/^\d{4}-\d{2}-\d{2}$/.test(source) &&
		!Number.isNaN(date.getTime()) &&
		date.toISOString().slice(0, 10) === source
		? date
		: new Date(NaN);
}

function parsePost(source: string, sourceName: string): Post {
	const tokens = markdown.parse(source, {});
	const headings = tokens.filter(
		(token) => token.type === "heading_open" && token.tag === "h1",
	);
	if (
		tokens[0]?.type !== "heading_open" ||
		tokens[0].tag !== "h1" ||
		headings.length !== 1
	) {
		throw new Error(
			`${sourceName}: start the post with one primary heading (# Title). Use ## for sections.`,
		);
	}
	const title = plainText(tokens[1].children!).trim();
	const dateLine =
		tokens[3]?.type === "paragraph_open" ? tokens[4]?.content : undefined;
	const publishedAt = parsePublicationDate(
		dateLine?.startsWith("Date:")
			? dateLine.slice("Date:".length).trim()
			: undefined,
	);
	return new Post(
		title,
		markdown.renderer.render(tokens.slice(6), markdown.options, {}),
		publishedAt,
	);
}

export async function generatePosts(
	directory = postsDirectory,
	destination = staticPostsFile,
): Promise<void> {
	const files = await readdir(directory, { withFileTypes: true });
	const names = files
		.filter((file) => file.isFile() && file.name.endsWith(".md"))
		.map((file) => file.name)
		.sort();
	const posts = await Promise.all(
		names.map(async (name) =>
			parsePost(await readFile(path.join(directory, name), "utf8"), name),
		),
	);
	posts.sort((first, second) => first.compareTo(second));
	const relativePath = path
		.relative(await realpath(path.dirname(destination)), postModule)
		.split(path.sep)
		.join("/");
	const importPath = relativePath.startsWith(".")
		? relativePath
		: `./${relativePath}`;
	const instances = posts.map(
		(post) =>
			`new Post(${JSON.stringify(post.getTitle())}, ${JSON.stringify(post.getContent())}, new Date(${JSON.stringify(post.getPublishedAt().toISOString())}))`,
	);
	const source = `import { Post } from ${JSON.stringify(importPath)};

export const staticPosts: readonly Post[] = Object.freeze([
${instances.join(",\n")}
]);
`;
	const options = await resolveConfig(postModule);
	await writeFile(
		destination,
		await format(source, { ...options, parser: "typescript" }),
	);
}

if (import.meta.main) {
	await generatePosts(process.argv[2], process.argv[3]);
	process.stdout.write("Static posts generated.\n");
}
