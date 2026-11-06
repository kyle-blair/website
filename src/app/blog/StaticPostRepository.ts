import type { Post } from "./Post.ts";
import { PostNotFoundError } from "./PostNotFoundError.ts";
import type { PostRepository } from "./PostRepository.ts";

export class StaticPostRepository implements PostRepository {
	readonly #posts: ReadonlyMap<string, Post>;

	public constructor(posts: readonly Post[]) {
		this.#posts = new Map(
			posts
				.toSorted((first, second) => first.compareTo(second))
				.map((post) => [post.getSlug(), post]),
		);
		Object.freeze(this);
	}

	public async getPosts(): Promise<readonly Post[]> {
		return Object.freeze([...this.#posts.values()]);
	}

	public async getPost(slug: string): Promise<Post> {
		const post = this.#posts.get(slug);
		if (!post) throw new PostNotFoundError(slug);
		return post;
	}
}
