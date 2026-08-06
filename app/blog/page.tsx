import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export const metadata: Metadata = {
  title: "blog",
  description: "Going down rabbit holes.",
};

export default function BlogPage() {
  return (
    <section className="blog-cover">
      <div className="blog-empty container">
        <span className="blog-empty__mark logo-numerals" aria-hidden="true">
          <span className="logo-numerals__zero">0</span>42
        </span>
        <div>
          <p className="eyebrow">blog</p>
          <h1>Nothing published. Yet.</h1>
          <p className="blog-empty__copy">
            Going down rabbit holes.
          </p>
          <Link className="text-link" href="/">
            <ArrowLeft size={16} aria-hidden="true" /> back home
          </Link>
        </div>
      </div>
    </section>
  );
}
