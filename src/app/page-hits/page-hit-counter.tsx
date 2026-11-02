"use client";

import { usePathname } from "next/navigation";
import { PageHitCount } from "./page-hit-count";

export function PageHitCounter() {
	const pathname = usePathname();
	return <PageHitCount key={pathname} path={pathname} />;
}
