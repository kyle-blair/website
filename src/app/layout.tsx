import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SiteVisitorDetails } from "@/components/site-visitor-details";
import { PageNavigation } from "@/components/page-navigation";
import { getPosts } from "./blog/posts";
import "./globals.css";

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
		...(await getPosts()).map((post) => ({
			path: `/blog/${post.slug}`,
			title: post.title,
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
