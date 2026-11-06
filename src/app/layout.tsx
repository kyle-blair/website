import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { SiteFooter } from "@/site-footer";
import { SiteHeader } from "@/site-header";
import { SiteVisitorDetails } from "@/site-visitor/site-visitor-details";
import { PageNavigation } from "@/page-navigation";
import type { PostRepository } from "./blog/PostRepository.ts";
import { StaticPostRepository } from "./blog/StaticPostRepository.ts";
import { staticPosts } from "./blog/posts.generated.ts";
import "./globals.css";

const postRepository: PostRepository = new StaticPostRepository(staticPosts);

const brandFont = IBM_Plex_Mono({
	subsets: ["latin"],
	variable: "--font-brand",
	weight: "700",
});

export const metadata: Metadata = {
	metadataBase: new URL("https://zerofourtwo.com"),
	title: {
		default: "zero four two",
		template: "%s | zero four two",
	},
	description: "Kyle Blair's site about design, engineering, and technology.",
	openGraph: {
		title: "zero four two",
		description:
			"Kyle Blair's site about design, engineering, and technology.",
		url: "https://zerofourtwo.com",
		siteName: "zero four two",
		type: "website",
	},
	robots: { index: true, follow: true },
};

export const viewport: Viewport = {
	colorScheme: "dark",
	themeColor: "#0a0a0a",
};

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const pages = [
		{ path: "/", title: "home" },
		{ path: "/blog", title: "blog" },
		...(await postRepository.getPosts()).map((post) => ({
			path: `/blog/${post.getSlug()}`,
			title: post.getTitle(),
		})),
		{ path: "/contact", title: "contact" },
	];
	return (
		<html
			className={brandFont.variable}
			lang="en"
			data-scroll-behavior="smooth"
		>
			<body>
				<a className="skip-link" href="#main-content">
					skip to content
				</a>
				<SiteHeader />
				<main id="main-content">
					<PageNavigation pages={pages} />
					{children}
				</main>
				<SiteVisitorDetails />
				<SiteFooter />
			</body>
		</html>
	);
}
