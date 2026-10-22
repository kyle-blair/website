import { SiteNavigationLinks } from "./site-navigation-links";
import { SiteVisitorDetails } from "./site-visitor-details";

export function SiteFooter() {
	return (
		<footer className="site-footer">
			<div className="site-footer__inner">
				<nav aria-label="Footer navigation">
					<SiteNavigationLinks />
				</nav>
				<SiteVisitorDetails />
			</div>
		</footer>
	);
}
