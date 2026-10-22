"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PageHitCount } from "./page-hit-count.tsx";

type Page = { path: string; title: string };

export function PageNavigation({ pages }: { pages: Page[] }) {
	const pathname = usePathname();
	const entries = pages.filter(
		(page) =>
			page.path === "/" ||
			pathname === encodeURI(page.path) ||
			pathname.startsWith(`${encodeURI(page.path)}/`),
	);
	return (
		<nav className="page-navigation container" aria-label="Page location">
			<ol key={pathname}>
				{entries.map((page) => {
					const current = pathname === encodeURI(page.path);
					return (
						<li key={page.path}>
							<Link
								className="page-navigation__entry"
								href={encodeURI(page.path)}
								aria-label={page.title}
								aria-current={current ? "page" : undefined}
							>
								<span className="page-navigation__title">
									{page.title}
								</span>
								{current && <PageHitCount path={page.path} />}
							</Link>
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
