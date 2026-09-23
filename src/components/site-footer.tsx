import { BrandMark } from "./brand-mark";
import { SiteNavigationLinks } from "./site-navigation-links";

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<BrandMark />
				<nav aria-label="Footer navigation">
					<SiteNavigationLinks />
				</nav>
			</div>
		</footer>
	);
}
