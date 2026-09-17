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
						I like creating surprisingly capable solutions by questioning
						assumptions, understanding what actually drives the problem, and
						applying thoughtful design where it matters most. I combine that
						mindset with a computer engineering degree and a decade of software
						engineering experience, using it throughout life, from professional
						projects to my homelab that always needs a new feature.
					</p>
				</div>
			</section>
		</>
	);
}
