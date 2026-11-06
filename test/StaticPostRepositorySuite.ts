import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { Post } from "../src/app/blog/Post.ts";
import type { PostRepository } from "../src/app/blog/PostRepository.ts";
import { StaticPostRepository } from "../src/app/blog/StaticPostRepository.ts";
import { staticPosts } from "../src/app/blog/posts.generated.ts";

suite("Static post repository", () => {
	test("finds a post by its exact slug and preserves its identity", async () => {
		const post = new Post("Example", "Content.", new Date("2026-05-03"));
		const repository: PostRepository = new StaticPostRepository([post]);
		assert.equal(await repository.getPost(post.getSlug()), post);
	});

	test("rejects missing slugs with an actionable post-not-found error", async () => {
		const post = new Post("Example", "Content.", new Date("2026-05-03"));
		for (const repository of [
			new StaticPostRepository([post]),
			new StaticPostRepository([]),
		]) {
			for (const slug of [
				"no-such-post",
				"Example",
				"",
				"constructor",
				"__proto__",
				"toString",
			]) {
				await assert.rejects(repository.getPost(slug), {
					name: "PostNotFoundError",
					message: `No post was found with the slug "${slug}". Check the slug against the published posts and try again.`,
				});
			}
		}
	});

	test("serves generated post instances without rereading source files", async () => {
		const repository: PostRepository = new StaticPostRepository(
			staticPosts,
		);
		const posts = await repository.getPosts();
		assert.ok(posts.length > 0);
		assert.ok(posts.every((post) => post instanceof Post));
		assert.ok(posts.every((post) => staticPosts.includes(post)));
		const published = await repository.getPost(
			"my-favorite-software-defect",
		);
		assert.ok(published);
		assert.match(published.getContent(), /<p>/);
	});

	test("returns its pre-instantiated posts in their natural order", async () => {
		const older = new Post(
			"Older",
			"Older content.",
			new Date("2025-01-01"),
		);
		const beta = new Post("Beta", "Beta content.", new Date("2026-01-01"));
		const alpha = new Post(
			"Alpha",
			"Alpha content.",
			new Date("2026-01-01"),
		);
		const repository: PostRepository = new StaticPostRepository([
			older,
			beta,
			alpha,
		]);
		const posts = await repository.getPosts();
		assert.equal(posts[0], alpha);
		assert.equal(posts[1], beta);
		assert.equal(posts[2], older);
		assert.deepEqual(await repository.getPosts(), posts);
		assert.notEqual(await repository.getPosts(), posts);
	});

	test("protects its collection from changes to the input and returned arrays", async () => {
		const post = new Post("Example", "Content.", new Date("2026-01-01"));
		const source = [post];
		const repository = new StaticPostRepository(source);
		source.length = 0;
		const posts = await repository.getPosts();
		assert.equal(posts.length, 1);
		assert.equal(posts[0], post);
		assert.equal(await repository.getPost(post.getSlug()), post);
		assert.ok(Object.isFrozen(repository));
		assert.ok(Object.isFrozen(posts));
		assert.equal(Reflect.set(posts, "length", 0), false);
		assert.deepEqual(await repository.getPosts(), [post]);
	});

	test("supports empty collections", async () => {
		assert.deepEqual(await new StaticPostRepository([]).getPosts(), []);
	});
});
