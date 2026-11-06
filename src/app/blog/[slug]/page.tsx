import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostNotFoundError } from "../PostNotFoundError.ts";
import type { PostRepository } from "../PostRepository.ts";
import { StaticPostRepository } from "../StaticPostRepository.ts";
import { staticPosts } from "../posts.generated.ts";
import { Feedback } from "@/feedback/feedback-controls";

const postRepository: PostRepository = new StaticPostRepository(staticPosts);

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

function handlePostLookupError(error: unknown): never {
	if (error instanceof PostNotFoundError) notFound();
	throw error;
}

export async function generateStaticParams() {
	return (await postRepository.getPosts()).map((post) => ({
		slug: post.getSlug(),
	}));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = await postRepository
		.getPost(slug)
		.catch(handlePostLookupError);
	return {
		title: post.getTitle(),
		alternates: {
			canonical: `/blog/${encodeURIComponent(post.getSlug())}`,
		},
		openGraph: {
			title: post.getTitle(),
			url: `/blog/${encodeURIComponent(post.getSlug())}`,
			type: "article",
		},
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = await postRepository
		.getPost(slug)
		.catch(handlePostLookupError);
	return (
		<div className="blog-article-page container">
			<div className="blog-article">
				<article>
					<header className="blog-article__header">
						<h1>{post.getTitle()}</h1>
						<time
							className="blog-post-date"
							dateTime={post.getPublishedAt().toISOString()}
						>
							{post.getPublishedAt().toISOString().slice(0, 10)}
						</time>
					</header>
					<Feedback subject={`/blog/${post.getSlug()}`}>
						<div
							className="blog-prose"
							dangerouslySetInnerHTML={{
								__html: post.getContent(),
							}}
						/>
					</Feedback>
				</article>
				<Link className="text-link" href="/blog">
					<ArrowLeft size={16} aria-hidden="true" /> all posts
				</Link>
			</div>
		</div>
	);
}
