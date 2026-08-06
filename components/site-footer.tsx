import Link from "next/link";
import { BrandMark } from "./brand-mark";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div>
          <BrandMark />
          <p>engineering done right</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link href="/blog">blog</Link>
          <Link href="/contact">contact</Link>
        </nav>
      </div>
      <div className="site-footer__legal">
        <span>© {new Date().getFullYear()} zero four two</span>
      </div>
    </footer>
  );
}
