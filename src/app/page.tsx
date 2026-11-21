import { ScrollReveal } from "@/scroll-reveal";
import { SignalField } from "@/signal-field";

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
					<p className="hero__statement">I love engineering.</p>
					<a
						className="hero__scroll"
						href="#approach"
						aria-label="Scroll to read more"
					>
						<span
							className="hero__scroll-track"
							aria-hidden="true"
						/>
						<span
							className="hero__scroll-chevrons"
							aria-hidden="true"
						/>
					</a>
				</div>
			</section>

			<ScrollReveal>
				<section
					className="home-chapter"
					id="approach"
					aria-label="Engineering"
				>
					<div
						className="home-chapter__content container"
						data-reveal
					>
						<div className="home-chapter__copy">
							<p className="home-chapter__lead">
								The real world is complex and full of engineering
								constraints.
							</p>
							<p>
								Few materials last forever. Protocols and standards
								constantly evolve. Foundational technologies are
								supplanted.
							</p>
							<p>
								The fun is in truly understanding a domain, then applying
								modularity, abstractions, and creativity to maximize
								design goals.
							</p>
						</div>
					</div>
				</section>
			</ScrollReveal>
		</div>
	);
}
