import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import type { PostRepository } from "./PostRepository.ts";
import { StaticPostRepository } from "./StaticPostRepository.ts";
import { staticPosts } from "./posts.generated.ts";

const postRepository: PostRepository = new StaticPostRepository(staticPosts);

export const metadata: Metadata = {
	title: "blog",
	description: "Down the rabbit hole.",
};

export default async function BlogPage() {
	const posts = await postRepository.getPosts();
	return (
		<section className="blog-cover">
			<div className="blog-index container">
				<header className="blog-intro">
					<p className="eyebrow">blog</p>
					<h1>Down the rabbit hole.</h1>
				</header>
				{posts.length ? (
					<ul className="blog-posts">
						{posts.map((post) => (
							<li key={post.getSlug()}>
								<Link
									className="blog-post-link"
									href={`/blog/${encodeURIComponent(post.getSlug())}`}
								>
									<h2>{post.getTitle()}</h2>
									<time
										className="blog-post-date"
										dateTime={post
											.getPublishedAt()
											.toISOString()}
									>
										{post
											.getPublishedAt()
											.toISOString()
											.slice(0, 10)}
									</time>
									<ArrowUpRight
										size={24}
										aria-hidden="true"
									/>
								</Link>
							</li>
						))}
					</ul>
				) : (
					<p className="blog-empty-copy">Nothing published. Yet.</p>
				)}
			</div>
		</section>
	);
}
