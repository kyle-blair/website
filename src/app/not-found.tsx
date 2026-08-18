import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function NotFound() {
  return (
    <section className="not-found container">
      <p className="eyebrow">404 / Not found</p>
      <h1>Follow the white rabbit.</h1>
      <Link className="text-link" href="/">
        <ArrowLeft size={16} aria-hidden="true" /> return home
      </Link>
    </section>
  );
}
