"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandMark } from "./brand-mark";

const links = [
	{ href: "/blog", label: "blog" },
	{ href: "/contact", label: "contact" },
];

export function SiteFooter() {
	const pathname = usePathname();

	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<BrandMark />
				<nav aria-label="Footer navigation">
					{links.map((link) => (
						<Link
							className={pathname.startsWith(link.href) ? "active" : undefined}
							href={link.href}
							key={link.href}
						>
							{link.label}
						</Link>
					))}
				</nav>
			</div>
		</footer>
	);
}
