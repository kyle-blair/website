import assert from "node:assert/strict";
import { suite, test } from "node:test";
import { Post } from "../src/app/blog/Post.ts";

suite("Post", () => {
	test("compares posts by publication timestamp with newer posts first", () => {
		const older = new Post(
			"Alpha",
			"",
			new Date("2026-05-03T12:00:00.000Z"),
		);
		const newer = new Post(
			"Beta",
			"",
			new Date("2026-05-03T12:00:00.001Z"),
		);
		assert.ok(newer.compareTo(older) < 0);
		assert.ok(older.compareTo(newer) > 0);
		assert.equal(newer.compareTo(newer), 0);
		assert.deepEqual(
			[older, newer]
				.sort((first, second) => first.compareTo(second))
				.map((post) => post.getTitle()),
			["Beta", "Alpha"],
		);
	});

	test("compares titles when publication timestamps match", () => {
		const publishedAt = new Date("2026-05-03T12:00:00Z");
		const alpha = new Post("Alpha", "", publishedAt);
		const beta = new Post("Beta", "", publishedAt);
		const equivalent = new Post(
			"Alpha",
			"Different content.",
			new Date("2026-05-03T08:00:00-04:00"),
			new Date("2026-05-04"),
		);
		assert.ok(alpha.compareTo(beta) < 0);
		assert.ok(beta.compareTo(alpha) > 0);
		assert.equal(alpha.compareTo(equivalent), 0);
	});

	test("retains its title, content, and publication timestamp through getter methods", () => {
		const publishedAt = new Date("2024-02-29T12:34:56.789Z");
		const post = new Post("A post", "Its content.", publishedAt);
		assert.equal(post.getTitle(), "A post");
		assert.equal(post.getContent(), "Its content.");
		assert.deepEqual(post.getPublishedAt(), publishedAt);
		assert.equal(new Post("Empty", "", publishedAt).getContent(), "");
	});

	test("defaults the last modification timestamp to the publication timestamp", () => {
		const publishedAt = new Date("2026-05-03T12:34:56Z");
		const post = new Post("Example", "Body.", publishedAt);
		assert.deepEqual(post.getLastModifiedAt(), publishedAt);
		assert.deepEqual(
			new Post(
				"Example",
				"Body.",
				publishedAt,
				undefined,
			).getLastModifiedAt(),
			publishedAt,
		);
	});

	test("retains an explicitly provided last modification timestamp", () => {
		const publishedAt = new Date("2026-05-03T12:34:56Z");
		const lastModifiedAt = new Date("2026-05-04T13:45:00Z");
		const post = new Post("Example", "Body.", publishedAt, lastModifiedAt);
		assert.deepEqual(post.getPublishedAt(), publishedAt);
		assert.deepEqual(post.getLastModifiedAt(), lastModifiedAt);
	});

	test("derives an address from the title", () => {
		for (const [title, slug] of [
			["A small café experiment!", "a-small-cafe-experiment"],
			["  Hello, world!  ", "hello-world"],
			["日本語 123", "日本語-123"],
		]) {
			assert.equal(
				new Post(title, "Body.", new Date("2026-05-03")).getSlug(),
				slug,
			);
		}
	});

	test("rejects titles that cannot identify a post", () => {
		for (const title of ["", "   ", "!!!"]) {
			assert.throws(
				() => new Post(title, "Body.", new Date("2026-05-03")),
				{
					name: "TypeError",
					message: /title must contain letters or numbers/,
				},
			);
		}
	});

	test("retains content without interpreting its format", () => {
		const publishedAt = new Date("2026-05-03");
		const content = "## Heading\n\n<script>example</script>";
		assert.equal(
			new Post("Example", content, publishedAt).getContent(),
			content,
		);
	});

	test("rejects invalid publication and modification timestamps", () => {
		assert.throws(() => new Post("Example", "Content.", new Date(NaN)), {
			name: "TypeError",
			message: /publishedAt must be a valid Date/,
		});
		assert.throws(
			() =>
				new Post(
					"Example",
					"Content.",
					new Date("2026-05-03"),
					new Date(NaN),
				),
			{
				name: "TypeError",
				message: /lastModifiedAt must be a valid Date/,
			},
		);
	});

	test("keeps its state private and prevents public reassignment", () => {
		const post = new Post("Example", "Body.", new Date("2026-05-03"));
		assert.ok(Object.isFrozen(post));
		assert.deepEqual(Object.keys(post), []);
		for (const field of [
			"title",
			"slug",
			"content",
			"publishedAt",
			"lastModifiedAt",
			"getTitle",
		]) {
			assert.equal(Reflect.set(post, field, "Changed"), false);
			assert.equal(
				Reflect.defineProperty(post, field, { value: "Changed" }),
				false,
			);
		}
		assert.equal(post.getTitle(), "Example");
		assert.equal(post.getSlug(), "example");
		assert.equal(post.getContent(), "Body.");
	});

	test("protects timestamps from mutation through constructor arguments and getter results", () => {
		const publishedAt = new Date("2026-05-03T12:34:56.789Z");
		const lastModifiedAt = new Date("2026-05-04T13:45:00Z");
		const post = new Post("Example", "Body.", publishedAt, lastModifiedAt);
		const unmodifiedPost = new Post("Example", "Body.", publishedAt);
		publishedAt.setTime(0);
		lastModifiedAt.setTime(0);
		post.getPublishedAt().setTime(0);
		post.getLastModifiedAt().setTime(0);
		unmodifiedPost.getLastModifiedAt().setTime(0);
		assert.equal(
			post.getPublishedAt().toISOString(),
			"2026-05-03T12:34:56.789Z",
		);
		assert.equal(
			post.getLastModifiedAt().toISOString(),
			"2026-05-04T13:45:00.000Z",
		);
		assert.equal(
			unmodifiedPost.getPublishedAt().toISOString(),
			"2026-05-03T12:34:56.789Z",
		);
		assert.equal(
			unmodifiedPost.getLastModifiedAt().toISOString(),
			"2026-05-03T12:34:56.789Z",
		);
	});
});
