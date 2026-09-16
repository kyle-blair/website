import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatPostDate, getPost, getPosts } from "../posts";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export async function generateStaticParams() {
	return (await getPosts()).map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { slug } = await params;
	const post = await getPost(slug);
	if (!post) notFound();
	return {
		title: post.title,
		alternates: { canonical: `/blog/${encodeURIComponent(post.slug)}` },
		openGraph: {
			title: post.title,
			url: `/blog/${encodeURIComponent(post.slug)}`,
			type: "article",
		},
	};
}

export default async function BlogPostPage({ params }: Props) {
	const { slug } = await params;
	const post = await getPost(slug);
	if (!post) notFound();
	return (
		<div className="blog-article-page">
			<div className="blog-article container">
				<Link className="text-link" href="/blog">
					<ArrowLeft size={16} aria-hidden="true" /> all posts
				</Link>
				<article>
					<header className="blog-article__header">
						<h1>{post.title}</h1>
						{post.date && (
							<time className="blog-post-date" dateTime={post.date}>
								{formatPostDate(post.date)}
							</time>
						)}
					</header>
					<div
						className="blog-prose"
						dangerouslySetInnerHTML={{ __html: post.body }}
					/>
				</article>
			</div>
		</div>
	);
}
