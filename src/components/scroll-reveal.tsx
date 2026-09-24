"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function ScrollReveal({ children }: { children: ReactNode }) {
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = containerRef.current;
		if (
			!container ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
			!("IntersectionObserver" in window)
		) {
			return;
		}

		const elements =
			container.querySelectorAll<HTMLElement>("[data-reveal]");
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.removeAttribute("data-reveal");
						observer.unobserve(entry.target);
					}
				}
			},
			{ threshold: 0, rootMargin: "0px 0px -48px 0px" },
		);

		for (const element of elements) {
			// Keep content visible on restored scroll positions and anchor visits.
			if (element.getBoundingClientRect().top >= window.innerHeight) {
				element.setAttribute("data-reveal", "pending");
				observer.observe(element);
			}
		}

		return () => {
			observer.disconnect();
			for (const element of elements)
				element.setAttribute("data-reveal", "");
		};
	}, []);

	return <div ref={containerRef}>{children}</div>;
}
