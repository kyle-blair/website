import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<BrandMark />
				<nav aria-label="Footer navigation">
					<Link href="/blog">blog</Link>
					<Link href="/contact">contact</Link>
				</nav>
			</div>
		</footer>
	);
}
