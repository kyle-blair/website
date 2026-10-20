"use client";

import { useEffect, useState } from "react";
import { UNKNOWN_NETWORK_ADDRESS } from "@/domain/network-address-value";
import { NetworkAddressView } from "./network-address-view";

type SiteVisitorResponse = {
	networkAddress: string;
};

export function SiteVisitorDetails() {
	const [address, setAddress] = useState(UNKNOWN_NETWORK_ADDRESS);
	const [isLoading, setIsLoading] = useState(true);
	const view = new NetworkAddressView(isLoading, address);

	useEffect(() => {
		const abortController = new AbortController();

		async function loadAddress() {
			try {
				const response = await fetch("/api/site-visitor", {
					signal: abortController.signal,
				});

				if (!response.ok) {
					return;
				}

				const result = (await response.json()) as SiteVisitorResponse;

				if (
					typeof result.networkAddress === "string" &&
					result.networkAddress.trim().length > 0
				) {
					setAddress(result.networkAddress);
				}
			} catch (error) {
				if (!(
					error instanceof DOMException && error.name === "AbortError"
				)) {
					setAddress(UNKNOWN_NETWORK_ADDRESS);
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		}

		void loadAddress();

		return () => abortController.abort();
	}, []);

	return (
		<div className="visitor-privacy">
			<p className="visitor-privacy__address">
				<span>{view.label}</span>
				<output aria-live="polite">
					{view.isLoading ? (
						<span
							className="visitor-privacy__loading"
							role="status"
							aria-label={view.accessibleLabel}
						>
							{view.glyphs.map((glyph) => (
								<span aria-hidden="true" key={glyph}>
									{glyph}
								</span>
							))}
						</span>
					) : (
						view.text
					)}
				</output>
			</p>
			<p className="visitor-privacy__note">
				This website and its owner respect your privacy. Nothing about
				your visit is stored beyond an aggregate &quot;hit
				counter&quot;.
			</p>
		</div>
	);
}
