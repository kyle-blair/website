import Link from "next/link";

export function BrandMark() {
  return (
    <Link className="brand-mark" href="/" aria-label="zero four two home">
      <span className="brand-mark__symbol" aria-hidden="true">
        <span className="logo-numerals">
          <span className="logo-numerals__zero">0</span>42
        </span>
      </span>
      <span className="brand-mark__name">
        <span className="brand-mark__name-zero">zero</span> four two
      </span>
    </Link>
  );
}
