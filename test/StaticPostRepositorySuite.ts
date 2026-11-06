import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { Post } from "../src/app/blog/Post.ts";
import type { PostRepository } from "../src/app/blog/PostRepository.ts";
import { StaticPostRepository } from "../src/app/blog/StaticPostRepository.ts";

suite("Static post repository", () => {
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
		assert.equal(await repository.getPosts(), posts);
	});

	test("protects its collection from changes to the input and returned arrays", async () => {
		const post = new Post("Example", "Content.", new Date("2026-01-01"));
		const source = [post];
		const repository = new StaticPostRepository(source);
		source.length = 0;
		const posts = await repository.getPosts();
		assert.equal(posts.length, 1);
		assert.equal(posts[0], post);
		assert.ok(Object.isFrozen(repository));
		assert.ok(Object.isFrozen(posts));
		assert.equal(Reflect.set(posts, "length", 0), false);
	});

	test("supports empty collections and posts with matching slugs", async () => {
		assert.deepEqual(await new StaticPostRepository([]).getPosts(), []);
		const first = new Post("Same title!", "First.", new Date("2026-01-01"));
		const second = new Post(
			"Same title?",
			"Second.",
			new Date("2026-01-01"),
		);
		const posts = await new StaticPostRepository([
			first,
			second,
		]).getPosts();
		assert.equal(posts.length, 2);
		assert.deepEqual(
			posts.map((post) => post.getSlug()),
			["same-title", "same-title"],
		);
	});
});
