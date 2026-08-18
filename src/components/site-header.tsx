"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandMark } from "./brand-mark";

const links = [
  { href: "/blog", label: "blog" },
  { href: "/contact", label: "contact" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return <SiteHeaderContent key={pathname} pathname={pathname} />;
}

function SiteHeaderContent({ pathname }: { pathname: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="site-header">
      <div className="site-header__inner">
        <BrandMark />
        <nav className="desktop-nav" aria-label="Primary navigation">
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
          {links.map((link) => (
            <Link href={link.href} key={link.href} onClick={() => setIsOpen(false)}>
              {link.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
