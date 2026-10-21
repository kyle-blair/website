import { PageHitCounter } from "./page-hit-counter";
import { BrandMark } from "./brand-mark";
import { SiteNavigationLinks } from "./site-navigation-links";
import { SiteVisitorDetails } from "./site-visitor-details";

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<div className="site-footer__primary">
					<BrandMark />
					<nav aria-label="Footer navigation">
						<SiteNavigationLinks />
					</nav>
				</div>
				<PageHitCounter />
				<SiteVisitorDetails />
			</div>
		</footer>
	);
}
