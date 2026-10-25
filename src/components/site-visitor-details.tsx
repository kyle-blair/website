"use client";
import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
} from "react";

import { UNKNOWN_NETWORK_ADDRESS } from "@/domain/network-address-value";
import { NetworkAddressView } from "./network-address-view";
import { averageFallingCharacterSpeed } from "./falling-character-speed.ts";

type SiteVisitorResponse = {
	networkAddress: string;
};

export function SiteVisitorDetails() {
	const [address, setAddress] = useState(UNKNOWN_NETWORK_ADDRESS);
	const [isLoading, setIsLoading] = useState(true);
	const [isPaused, setIsPaused] = useState(false);
	const windowRef = useRef<HTMLButtonElement>(null);
	const trackRef = useRef<HTMLSpanElement>(null);
	const [animationDuration, setAnimationDuration] = useState(0);
	const view = new NetworkAddressView(isLoading, address);
	const streamText = view.isLoading ? view.glyphs.join("") : view.text;

	useLayoutEffect(() => {
		const addressWindow = windowRef.current!;
		const track = trackRef.current!;
		const windowHeight = addressWindow.clientHeight;
		addressWindow.style.setProperty(
			"--address-animation-window-height",
			`${windowHeight}px`,
		);
		const distance = windowHeight + track.clientHeight;
		setAnimationDuration(distance / averageFallingCharacterSpeed);
	}, [streamText]);

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
		<aside className="network-address-stream" aria-label="Your connection">
			<output className="visually-hidden" aria-live="polite">
				{view.label}: {view.accessibleLabel}
			</output>
			<p className="visually-hidden">
				Your network address is displayed here and is not stored. This
				site records aggregate page views and service diagnostics
				without visitor identifiers.
			</p>
			<button
				className="network-address-stream__window"
				ref={windowRef}
				type="button"
				aria-label={
					isPaused
						? "Resume network address animation"
						: "Pause network address animation"
				}
				aria-pressed={isPaused}
				title={`${view.label}: ${view.accessibleLabel}. Your network address is not stored. Click to pause or resume.`}
				style={
					{
						"--address-length": streamText.length,
					} as CSSProperties
				}
				onClick={() => setIsPaused((current) => !current)}
			>
				<span
					className="network-address-stream__track"
					ref={trackRef}
					aria-hidden="true"
					style={{
						animationDuration: `${animationDuration}s`,
					}}
				>
					<span className="network-address-stream__address">
						{[...streamText].map((character, index) => (
							<span
								className="network-address-stream__character"
								key={index}
							>
								{character}
							</span>
						))}
					</span>
				</span>
			</button>
		</aside>
	);
}
