"use client";

import { useEffect, useRef, useState } from "react";

type CountState =
	| { status: "loading" }
	| { status: "ready"; count: number }
	| { status: "unavailable" };

export function PageHitCount({ path }: { path: string }) {
	const [state, setState] = useState<CountState>({ status: "loading" });
	const operationId = useRef<string | undefined>(undefined);

	useEffect(() => {
		const controller = new AbortController();

		async function loadCount() {
			try {
				operationId.current ??= crypto.randomUUID();
				const response = await fetch("/api/page-hits", {
					method: "POST",
					headers: { "content-type": "application/json" },
					body: JSON.stringify({
						path,
						operationId: operationId.current,
					}),
					cache: "no-store",
					signal: AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(5000),
					]),
				});
				if (!response.ok) {
					throw new Error("Page count unavailable");
				}
				const result = await response.json();
				if (!Number.isSafeInteger(result?.count) || result.count < 0) {
					throw new Error("Invalid page count");
				}
				if (!controller.signal.aborted) {
					setState({ status: "ready", count: result.count });
				}
			} catch {
				if (!controller.signal.aborted) {
					setState({ status: "unavailable" });
				}
			}
		}

		void loadCount();
		return () => controller.abort();
	}, [path]);

	return (
		<span className="page-hit-count">
			<span>views:</span>{" "}
			<output aria-live="polite" aria-busy={state.status === "loading"}>
				{state.status === "loading" ? (
					<span role="status" aria-label="Loading page views">
						?
					</span>
				) : state.status === "ready" ? (
					state.count.toLocaleString("en-US")
				) : (
					<span role="status" aria-label="Page views unavailable">
						?
					</span>
				)}
			</output>
		</span>
	);
}
