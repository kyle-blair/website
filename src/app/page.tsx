import { SignalField } from "@/components/signal-field";

export default function Home() {
	return (
		<>
			<section className="hero">
				<SignalField />
				<div className="hero__content container">
					<p className="eyebrow">home</p>
					<h1>kyle blair</h1>
					<p className="hero__statement">
						I like creating surprisingly versatile solutions by avoiding
						unnecessary assumptions and applying a little thoughtful design. I
						have a computer engineering degree, a decade of experience as a
						software engineer, and a homelab that always needs a new feature.
					</p>
				</div>
			</section>
		</>
	);
}
