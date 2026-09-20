import { ArrowDown } from "lucide-react";
import { ScrollReveal } from "@/components/scroll-reveal";
import { SignalField } from "@/components/signal-field";

export default function Home() {
	return (
		<div className="home-page">
			<div className="home-page__background" aria-hidden="true">
				<SignalField />
			</div>
			<section className="hero" aria-labelledby="home-heading">
				<div className="hero__content container">
					<p className="eyebrow">home</p>
					<h1 id="home-heading">kyle blair</h1>
					<p className="hero__statement">
						I like creating surprisingly capable solutions.
					</p>
					<a className="hero__scroll" href="#approach">
						scroll to explore <ArrowDown size={18} aria-hidden="true" />
					</a>
				</div>
			</section>

			<ScrollReveal>
				<section
					className="home-chapter"
					id="approach"
					aria-labelledby="approach-heading"
				>
					<div className="home-chapter__content container" data-reveal>
						<p className="eyebrow">approach</p>
						<div className="home-chapter__copy">
							<h2 id="approach-heading">Question assumptions.</h2>
							<p>
								Understand what actually drives the problem, then apply
								thoughtful design where it matters most.
							</p>
						</div>
					</div>
				</section>

				<section className="home-chapter" aria-labelledby="background-heading">
					<div className="home-chapter__content container" data-reveal>
						<p className="eyebrow">background</p>
						<div className="home-chapter__copy">
							<h2 id="background-heading">Put it into practice.</h2>
							<p>
								I combine that approach with a computer engineering degree and
								a decade of software engineering experience, applying it all 
								to professional projects, everyday problems, and a
								homelab that always needs a new feature.
							</p>
						</div>
					</div>
				</section>
			</ScrollReveal>
		</div>
	);
}
