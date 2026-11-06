import type { PostRepository } from "./PostRepository.ts";
import { StaticPostRepository } from "./StaticPostRepository.ts";
import { staticPosts } from "./posts.generated.ts";

const postRepository: PostRepository = new StaticPostRepository(staticPosts);

export function getPosts(repository: PostRepository = postRepository) {
	return repository.getPosts();
}

export async function getPost(
	slug: string,
	repository: PostRepository = postRepository,
) {
	return (await repository.getPosts()).find(
		(post) => post.getSlug() === slug,
	);
}
