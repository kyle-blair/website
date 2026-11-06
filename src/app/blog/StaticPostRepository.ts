import type { Post } from "./Post.ts";
import type { PostRepository } from "./PostRepository.ts";

export class StaticPostRepository implements PostRepository {
	readonly #posts: readonly Post[];

	public constructor(posts: readonly Post[]) {
		this.#posts = Object.freeze(
			[...posts].sort((first, second) => first.compareTo(second)),
		);
		Object.freeze(this);
	}

	public async getPosts(): Promise<readonly Post[]> {
		return this.#posts;
	}
}
