"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNavigationLinks } from "./site-navigation-links";

export function SiteNavigation({ label }: { label: string }) {
	const pathname = usePathname();

	return <SiteNavigationContent key={pathname} label={label} />;
}

function SiteNavigationContent({ label }: { label: string }) {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<div className="site-navigation__inner">
				<BrandMark />
				<nav className="desktop-nav" aria-label={label}>
					<SiteNavigationLinks />
				</nav>
				<button
					className="icon-button mobile-menu-button"
					type="button"
					aria-label={isOpen ? "Close navigation" : "Open navigation"}
					aria-expanded={isOpen}
					onClick={() => setIsOpen((current) => !current)}
				>
					{isOpen ? <X size={20} /> : <Menu size={20} />}
				</button>
			</div>
			{isOpen && (
				<nav className="mobile-nav" aria-label={`${label} (mobile)`}>
					<SiteNavigationLinks onNavigate={() => setIsOpen(false)} />
				</nav>
			)}
		</>
	);
}
