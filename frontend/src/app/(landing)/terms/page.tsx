import Link from "next/link";

import AppFooter from "@/components/app/AppFooter";

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <section className="card legal-card">
        <span className="section-kicker">Legal</span>
        <h1>OutfitsMe Terms of Service</h1>
        <p className="subtext">Last updated: March 5, 2026</p>

        <h2>1. Service requirements</h2>
        <p>
          OutfitsMe provides a managed experience for outfit analysis, wardrobe organization, and image-based previews.
          Trial access, daily limits, and feature availability may change over time.
        </p>

        <h2>2. Trial usage and billing</h2>
        <p>
          During the current trial period, OutfitsMe covers external AI usage behind the service. We may limit,
          throttle, or suspend AI-powered features to prevent abuse or manage operational costs.
        </p>

        <h2>3. User content</h2>
        <p>
          You retain ownership of images and content you upload. By using the service, you grant us permission to
          process that content to provide analysis, outfit previews, wardrobe organization, and related features.
        </p>

        <h2>4. Acceptable use</h2>
        <p>
          You agree not to use OutfitsMe for unlawful, abusive, or harmful content or activity. We may suspend access
          for misuse or attempts to bypass usage controls.
        </p>

        <h2>5. Availability and changes</h2>
        <p>
          We may modify, pause, or discontinue features at any time. Service availability is not guaranteed, and
          retailer-search features may remain incomplete until third-party integrations are finalized.
        </p>

        <h2>6. Disclaimer and liability</h2>
        <p>
          OutfitsMe is provided &quot;as is&quot; without warranties. To the maximum extent permitted by law, we are not liable
          for indirect, incidental, or consequential damages resulting from use of the service.
        </p>

        <div className="button-row">
          <Link className="ghost-btn" href="/">
            Back to app
          </Link>
        </div>
      </section>
      <AppFooter />
    </main>
  );
}

