"use client";

import { Menu, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand-mark";
import { SiteNavigationLinks } from "./site-navigation-links";

export function SiteHeader() {
	const pathname = usePathname();

	return <SiteHeaderContent key={pathname} />;
}

function SiteHeaderContent() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<header className="site-header">
			<div className="site-header__inner">
				<BrandMark />
				<nav className="desktop-nav" aria-label="Primary navigation">
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
				<nav className="mobile-nav" aria-label="Mobile navigation">
					<SiteNavigationLinks onNavigate={() => setIsOpen(false)} />
				</nav>
			)}
		</header>
	);
}
