import type { Post } from "./Post.ts";

export interface PostRepository {
	getPosts(): Promise<readonly Post[]>;
}
