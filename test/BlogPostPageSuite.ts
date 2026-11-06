import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { suite, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { JSDOM } from "jsdom";
import { StaticPostRepository } from "../src/app/blog/StaticPostRepository.ts";
import { staticPosts } from "../src/app/blog/posts.generated.ts";

registerHooks({
	resolve(specifier, context, nextResolve) {
		if (specifier === "next/link" || specifier === "next/navigation")
			return nextResolve(`${specifier}.js`, context);
		if (specifier === "@/feedback/feedback-controls")
			return nextResolve(
				new URL(
					"../src/app/feedback/feedback-controls.tsx",
					import.meta.url,
				).href,
				context,
			);
		return nextResolve(specifier, context);
	},
});

const {
	default: BlogPostPage,
	dynamicParams,
	generateStaticParams,
	generateMetadata,
} = await import("../src/app/blog/[slug]/page.tsx");

suite("Blog post page", () => {
	test("generates static routes for the repository's published posts", async () => {
		assert.equal(dynamicParams, false);
		const posts = await new StaticPostRepository(staticPosts).getPosts();
		assert.deepEqual(
			await generateStaticParams(),
			posts.map((post) => ({ slug: post.getSlug() })),
		);
	});

	test("uses a post's domain values for metadata and article content", async () => {
		const [post] = staticPosts;
		const props = { params: Promise.resolve({ slug: post.getSlug() }) };
		const path = `/blog/${encodeURIComponent(post.getSlug())}`;
		assert.deepEqual(await generateMetadata(props), {
			title: post.getTitle(),
			alternates: { canonical: path },
			openGraph: { title: post.getTitle(), url: path, type: "article" },
		});
		const dom = new JSDOM(renderToStaticMarkup(await BlogPostPage(props)));
		const document = dom.window.document;
		assert.equal(
			document.querySelector("h1")!.textContent,
			post.getTitle(),
		);
		assert.equal(
			document.querySelector("time")!.dateTime,
			post.getPublishedAt().toISOString(),
		);
		const expected = document.createElement("div");
		expected.innerHTML = post.getContent();
		assert.equal(
			document.querySelector(".blog-prose")!.innerHTML,
			expected.innerHTML,
		);
		dom.window.close();
	});

	test("translates missing posts into a 404 for metadata and rendering", async () => {
		const props = { params: Promise.resolve({ slug: "no-such-post" }) };
		for (const load of [generateMetadata, BlogPostPage]) {
			await assert.rejects(load(props), {
				digest: "NEXT_HTTP_ERROR_FALLBACK;404",
			});
		}
	});

	test("propagates unrelated repository failures without turning them into 404s", async (context) => {
		const failure = new Error("The post repository is unavailable.");
		context.mock.method(
			StaticPostRepository.prototype,
			"getPost",
			async () => {
				throw failure;
			},
		);
		const props = { params: Promise.resolve({ slug: "example" }) };
		for (const load of [generateMetadata, BlogPostPage]) {
			await assert.rejects(load(props), (error) => error === failure);
		}
	});
});
