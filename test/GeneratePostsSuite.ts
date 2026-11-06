import assert from "node:assert/strict";
import {
	mkdtemp,
	mkdir,
	writeFile,
	readFile,
	rm,
	copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { suite, test, type TestContext } from "node:test";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { generatePosts } from "../scripts/generate-posts.ts";
import { Post } from "../src/app/blog/Post.ts";

async function temporaryPosts(context: TestContext) {
	const directory = await mkdtemp(path.join(tmpdir(), "website-blog-"));
	context.after(() => rm(directory, { recursive: true, force: true }));
	return directory;
}

async function generatedPosts(directory: string): Promise<readonly Post[]> {
	const destination = path.join(directory, "posts.generated.ts");
	await generatePosts(directory, destination);
	const generated = await import(
		pathToFileURL(destination).href + "?" + crypto.randomUUID()
	);
	return generated.staticPosts;
}

suite("Generate static posts", () => {
	test("generates posts from Markdown headings and rendered content", async (context) => {
		const directory = await temporaryPosts(context);
		const original = path.join(directory, "arbitrary-filename.md");
		const copy = path.join(directory, "another-filename.md");
		await writeFile(
			original,
			"# First post\n\nDate: 2026-05-03\n\nOriginal body.",
		);
		assert.equal((await generatedPosts(directory)).length, 1);
		await copyFile(original, copy);
		await writeFile(
			copy,
			"# A **small** `café` experiment!\n\nDate: 2026-05-03\n\n## Details\n\n- One\n- Two\n\n```js\nconst value = 1;\n```",
		);
		await writeFile(path.join(directory, "notes.txt"), "Not a post");
		await mkdir(path.join(directory, "not-a-file.md"));
		const posts = await generatedPosts(directory);
		assert.ok(posts.every((post) => post instanceof Post));
		assert.ok(
			posts.every(
				(post) =>
					post.getLastModifiedAt().getTime() ===
					post.getPublishedAt().getTime(),
			),
		);
		assert.deepEqual(
			posts.map((post) => ({
				title: post.getTitle(),
				slug: post.getSlug(),
			})),
			[
				{
					title: "A small café experiment!",
					slug: "a-small-cafe-experiment",
				},
				{ title: "First post", slug: "first-post" },
			],
		);
		assert.match(posts[0].getContent(), /<h2>Details<\/h2>/);
		assert.match(posts[0].getContent(), /<li>One<\/li>/);
		assert.match(posts[0].getContent(), /<code class="language-js">/);
		assert.doesNotMatch(posts[0].getContent(), /<h1>/);
	});

	test.skip(
		"duplicate slugs have no handling or behavioral guarantees; post authors are responsible for unique slugs",
	);

	test("posts require a primary heading and a usable address", async (context) => {
		const directory = await temporaryPosts(context);
		const file = path.join(directory, "missing-title.md");
		await writeFile(file, "Body without a heading.");
		await assert.rejects(
			generatedPosts(directory),
			/missing-title.md: start the post/,
		);
		await writeFile(file, "# First\n\n# Second");
		await assert.rejects(generatedPosts(directory), /one primary heading/);
		await writeFile(file, "# !!!\n\nDate: 2026-05-03\n\nBody.");
		await assert.rejects(
			generatedPosts(directory),
			/title must contain letters or numbers/,
		);
	});

	test("Markdown rendering escapes embedded HTML and rejects script links", async (context) => {
		const directory = await temporaryPosts(context);
		await writeFile(
			path.join(directory, "example.md"),
			"# Example\n\nDate: 2026-05-03\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))",
		);
		const [post] = await generatedPosts(directory);
		assert.match(post.getContent(), /&lt;script&gt;/);
		assert.doesNotMatch(post.getContent(), /<script>|href="javascript:/);
	});
	test("posts sort by publication date, then title", async (context) => {
		const directory = await temporaryPosts(context);
		await Promise.all([
			writeFile(
				path.join(directory, "beta.md"),
				"# Beta\n\nDate: 2026-05-03\n\nBeta body.",
			),
			writeFile(
				path.join(directory, "alpha.md"),
				"# Alpha\n\nDate: 2026-05-03\n\nAlpha body.",
			),
			writeFile(
				path.join(directory, "earlier.md"),
				"# Earlier\n\nDate: 2025-12-31\n\nEarlier body.",
			),
			writeFile(
				path.join(directory, "oldest.md"),
				"# Oldest\n\nDate: 2024-01-01\n\nOldest body.",
			),
		]);
		const posts = await generatedPosts(directory);
		assert.deepEqual(
			posts.map((post) => ({
				title: post.getTitle(),
				publishedAt: post.getPublishedAt(),
			})),
			[
				{ title: "Alpha", publishedAt: new Date("2026-05-03") },
				{ title: "Beta", publishedAt: new Date("2026-05-03") },
				{ title: "Earlier", publishedAt: new Date("2025-12-31") },
				{ title: "Oldest", publishedAt: new Date("2024-01-01") },
			],
		);
		assert.match(posts[0].getContent(), /<p>Alpha body\.<\/p>/);
		assert.doesNotMatch(posts[0].getContent(), /Date:|<h1>/);
	});

	test("the Post constructor rejects missing publication dates", async (context) => {
		const directory = await temporaryPosts(context);
		const file = path.join(directory, "undated.md");
		for (const source of [
			"# Undated",
			"# Undated\n\nBody.",
			"# Undated\n\n## Section",
		]) {
			await writeFile(file, source);
			await assert.rejects(generatedPosts(directory), {
				name: "TypeError",
				message: /publishedAt must be a valid Date/,
			});
		}
	});

	test("the Post constructor rejects unparseable publication dates", async (context) => {
		const directory = await temporaryPosts(context);
		const file = path.join(directory, "dated.md");
		for (const date of [
			"yesterday",
			"2026-02-30",
			"2026-13-01",
			"2026-05-03 extra",
		]) {
			await writeFile(file, `# Dated\n\nDate: ${date}\n\nBody.`);
			await assert.rejects(generatedPosts(directory), {
				name: "TypeError",
				message: /publishedAt must be a valid Date/,
			});
		}
	});

	test("image alternative text contributes to a post title and address", async (context) => {
		const directory = await temporaryPosts(context);
		await writeFile(
			path.join(directory, "image-heading.md"),
			"# Meet ![zero four two](logo.png)\n\nDate: 2026-05-03\n\nBody.",
		);
		const [post] = await generatedPosts(directory);
		assert.equal(post.getTitle(), "Meet zero four two");
		assert.equal(post.getSlug(), "meet-zero-four-two");
	});
	test("generates deterministic source and preserves the previous output when validation fails", async (context) => {
		const directory = await temporaryPosts(context);
		const file = path.join(directory, "example.md");
		const destination = path.join(directory, "posts.generated.ts");
		await writeFile(
			file,
			'# A "quoted" `title`\n\nDate: 2026-05-03\n\nLiteral `${notExecuted}` and "quotes".',
		);
		const [post] = await generatedPosts(directory);
		assert.equal(post.getTitle(), 'A "quoted" title');
		assert.match(post.getContent(), /<code>\$\{notExecuted\}<\/code>/);
		const original = await readFile(destination, "utf8");
		await generatePosts(directory, destination);
		assert.equal(await readFile(destination, "utf8"), original);
		await writeFile(file, "Missing a title.");
		await assert.rejects(
			generatePosts(directory, destination),
			/one primary heading/,
		);
		assert.equal(await readFile(destination, "utf8"), original);
	});

	test("supports an empty source directory", async (context) => {
		const directory = await temporaryPosts(context);
		assert.deepEqual(await generatedPosts(directory), []);
	});

	test("runs as a development command", async (context) => {
		const directory = await temporaryPosts(context);
		const destination = path.join(directory, "posts.generated.ts");
		await writeFile(
			path.join(directory, "example.md"),
			"# Example\n\nDate: 2026-05-03\n\nContent.",
		);
		await promisify(execFile)(process.execPath, [
			fileURLToPath(
				new URL("../scripts/generate-posts.ts", import.meta.url),
			),
			directory,
			destination,
		]);
		const generated = await import(pathToFileURL(destination).href);
		assert.equal(generated.staticPosts[0].getTitle(), "Example");
	});
});
