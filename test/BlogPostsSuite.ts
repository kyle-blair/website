import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { getPost, getPosts } from "../src/app/blog/posts.ts";
import { Post } from "../src/app/blog/Post.ts";
import type { PostRepository } from "../src/app/blog/PostRepository.ts";

suite("Blog posts", () => {
	test("uses the supplied repository and finds posts by slug", async () => {
		const post = new Post("Example", "Content.", new Date("2026-05-03"));
		const posts = Object.freeze([post]);
		const repository: PostRepository = { getPosts: async () => posts };
		assert.equal(await getPosts(repository), posts);
		assert.equal(await getPost(post.getSlug(), repository), post);
		assert.equal(await getPost("no-such-post", repository), undefined);
	});

	test("serves predefined post instances without rereading source files", async () => {
		const posts = await getPosts();
		assert.ok(posts.length > 0);
		assert.ok(Object.isFrozen(posts));
		assert.ok(posts.every((post) => post instanceof Post));
		assert.equal(await getPosts(), posts);
		assert.equal(await getPost(posts[0].getSlug()), posts[0]);
		assert.equal(await getPost("no-such-post"), undefined);
		const published = await getPost("my-favorite-software-defect");
		assert.ok(published);
		assert.match(published.getContent(), /<p>/);
	});

	test("propagates original repository failures", async () => {
		const failure = new Error("The posts could not be loaded.");
		const repository: PostRepository = {
			getPosts: async () => {
				throw failure;
			},
		};
		await assert.rejects(
			getPosts(repository),
			(error) => error === failure,
		);
		await assert.rejects(
			getPost("example", repository),
			(error) => error === failure,
		);
	});
});
