import Link from "next/link";
import { ChevronRight, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

import AppFooter from "@/components/app/AppFooter";
import AppHeader from "@/components/app/AppHeader";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type LegalSection = {
  title: string;
  content: ReactNode;
};

type LegalPageProps = {
  label: string;
  title: string;
  lastUpdated: string;
  summary: string;
  highlights: string[];
  sections: LegalSection[];
  companionHref: string;
  companionLabel: string;
};

export default function LegalPage({
  label,
  title,
  lastUpdated,
  summary,
  highlights,
  sections,
  companionHref,
  companionLabel,
}: LegalPageProps) {
  return (
    <main className="landing-shell">
      <div className="landing-page legal-page">
        <AppHeader
          actions={
            <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
              <Link
                className={buttonVariants({ variant: "outline" })}
                href={companionHref}
              >
                {companionLabel}
              </Link>
              <Link className={buttonVariants({ variant: "default" })} href="/">
                Back to app
              </Link>
            </div>
          }
        />

        <section className="legal-hero-grid">
          <Card
            as="section"
            className="c-surface c-surface--stack c-surface--accent legal-hero-card"
          >
            <span className="section-kicker">{label}</span>
            <div className="o-stack o-stack--tight o-stack--start">
              <h1>{title}</h1>
              <p className="hero-copy-text legal-hero-summary">{summary}</p>
            </div>
            <div className="o-cluster o-cluster--wrap legal-meta-row">
              <span className="legal-meta-pill">
                <ShieldCheck size={16} />
                Last updated {lastUpdated}
              </span>
              <Link className="legal-inline-link" href={companionHref}>
                {companionLabel}
                <ChevronRight size={16} />
              </Link>
            </div>
          </Card>

          <Card
            as="aside"
            className="c-surface c-surface--stack legal-summary-card"
          >
            <span className="section-kicker">At a glance</span>
            <ul className="legal-highlight-list">
              {highlights.map((highlight) => (
                <li key={highlight}>{highlight}</li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="legal-sections" aria-label={`${label} details`}>
          {sections.map((section, index) => (
            <Card
              as="section"
              key={section.title}
              className="c-surface c-surface--stack legal-section-card"
            >
              <div className="o-media o-media--start legal-section-head">
                <span className="legal-section-number">{index + 1}</span>
                <div className="o-stack o-stack--tight o-stack--start">
                  <h2>{section.title}</h2>
                  <div className="legal-section-copy">{section.content}</div>
                </div>
              </div>
            </Card>
          ))}
        </section>

        <Card as="section" className="c-surface c-surface--stack legal-cta-card">
          <span className="section-kicker">Need anything else?</span>
          <div className="o-stack o-stack--tight o-stack--start">
            <h2>Review the policy details any time.</h2>
            <p className="subtext">
              These pages are here to make the rules around your account,
              uploads, and generated looks easier to scan.
            </p>
          </div>
          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            <Link className={buttonVariants({ variant: "default" })} href="/">
              Return to OutfitsMe
            </Link>
            <Link
              className={buttonVariants({ variant: "outline" })}
              href={companionHref}
            >
              {companionLabel}
            </Link>
          </div>
        </Card>

        <AppFooter />
      </div>
    </main>
  );
}
