import type { Metadata } from "next";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { formatPostDate, getPosts } from "./posts";

export const metadata: Metadata = {
	title: "blog",
	description: "Down the rabbit hole.",
};

export default async function BlogPage() {
	const posts = await getPosts();
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
							<li key={post.slug}>
								<Link
									className="blog-post-link"
									href={`/blog/${encodeURIComponent(post.slug)}`}
								>
									<h2>{post.title}</h2>
									{post.date && (
										<time
											className="blog-post-date"
											dateTime={post.date}
										>
											{formatPostDate(post.date)}
										</time>
									)}
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
