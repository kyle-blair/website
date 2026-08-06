import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "contact",
  description: "Get in touch with me.",
};

export default function ContactPage() {
  return (
    <div className="contact-page">
      <section className="contact-section section container" id="contact">
        <div className="contact-intro">
          <p className="eyebrow">contact</p>
          <h1>Say hello.</h1>
          <p>
            Want to share an idea, ask a question, or collaborate on something?
            Send me an email. Keys for OpenPGP / RFC 9580 encryption will 
            be added soon.
          </p>
          <a className="plain-email" href="mailto:hello@zerofourtwo.com">
            hello@zerofourtwo.com <ArrowRight size={17} aria-hidden="true" />
          </a>
        </div>
      </section>
    </div>
  );
}
