"use client";

import { useEffect, useState } from "react";
import { readPageHitCount } from "../infrastructure/browser-page-hits.ts";

type CountState =
	| { status: "loading" }
	| { status: "ready"; count: number }
	| { status: "unavailable" };

export function PageHitCount({ path }: { path: string }) {
	const [state, setState] = useState<CountState>({ status: "loading" });

	useEffect(() => {
		const controller = new AbortController();

		async function loadCount() {
			try {
				const count = await readPageHitCount(
					path,
					AbortSignal.any([
						controller.signal,
						AbortSignal.timeout(5000),
					]),
				);
				if (!controller.signal.aborted) {
					setState({ status: "ready", count });
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
