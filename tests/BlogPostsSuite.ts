import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { suite, test, type TestContext } from "node:test";
import { getPosts } from "../src/app/blog/posts.ts";

async function temporaryPosts(context: TestContext) {
	const directory = await mkdtemp(path.join(tmpdir(), "website-blog-"));
	context.after(() => rm(directory, { recursive: true, force: true }));
	return directory;
}

suite("Blog posts", () => {
	test("copying and editing Markdown automatically adds a post using its heading", async (context) => {
		const directory = await temporaryPosts(context);
		const original = path.join(directory, "arbitrary-filename.md");
		const copy = path.join(directory, "another-filename.md");
		await writeFile(original, "# First post\n\nOriginal body.");
		assert.equal((await getPosts(directory)).length, 1);
		await copyFile(original, copy);
		await writeFile(
			copy,
			"# A **small** `café` experiment!\n\n## Details\n\n- One\n- Two\n\n```js\nconst value = 1;\n```",
		);
		await writeFile(path.join(directory, "notes.txt"), "Not a post");
		await mkdir(path.join(directory, "not-a-file.md"));
		const posts = await getPosts(directory);
		assert.deepEqual(
			posts.map(({ title, slug }) => ({ title, slug })),
			[
				{ title: "A small café experiment!", slug: "a-small-cafe-experiment" },
				{ title: "First post", slug: "first-post" },
			],
		);
		assert.match(posts[0].body, /<h2>Details<\/h2>/);
		assert.match(posts[0].body, /<li>One<\/li>/);
		assert.match(posts[0].body, /<code class="language-js">/);
		assert.doesNotMatch(posts[0].body, /<h1>/);
	});

	test("ambiguous post addresses fail with an actionable error", async (context) => {
		const directory = await temporaryPosts(context);
		await writeFile(path.join(directory, "one.md"), "# Same title!\n\nOne.");
		await writeFile(path.join(directory, "two.md"), "# Same title?\n\nTwo.");
		await assert.rejects(
			getPosts(directory),
			/Multiple post titles produce \/blog\/same-title/,
		);
	});

	test("posts require a primary heading and a usable address", async (context) => {
		const directory = await temporaryPosts(context);
		const file = path.join(directory, "missing-title.md");
		await writeFile(file, "Body without a heading.");
		await assert.rejects(
			getPosts(directory),
			/missing-title.md: start the post/,
		);
		await writeFile(file, "# First\n\n# Second");
		await assert.rejects(getPosts(directory), /one primary heading/);
		await writeFile(file, "# !!!\n\nBody.");
		await assert.rejects(
			getPosts(directory),
			/title must contain letters or numbers/,
		);
	});

	test("Markdown rendering escapes embedded HTML and rejects script links", async (context) => {
		const directory = await temporaryPosts(context);
		await writeFile(
			path.join(directory, "example.md"),
			"# Example\n\n<script>alert(1)</script>\n\n[link](javascript:alert(1))",
		);
		const [post] = await getPosts(directory);
		assert.match(post.body, /&lt;script&gt;/);
		assert.doesNotMatch(post.body, /<script>|href="javascript:/);
	});
});
