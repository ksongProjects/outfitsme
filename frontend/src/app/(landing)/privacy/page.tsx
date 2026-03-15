import Link from "next/link";

import AppFooter from "@/components/app/AppFooter";

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <section className="card legal-card">
        <span className="section-kicker">Legal</span>
        <h1>OutfitsMe Privacy Policy</h1>
        <p className="subtext">Last updated: March 5, 2026</p>

        <h2>1. Data we process</h2>
        <p>
          We process account information, uploaded images, feature preferences, and generated outputs to operate the
          outfit analysis, wardrobe, and preview features inside OutfitsMe.
        </p>

        <h2>2. How we use data</h2>
        <p>
          Your data is used to run the app, maintain your saved wardrobe, improve reliability, and support AI-powered
          features such as image analysis and personalized outfit previews.
        </p>

        <h2>3. Third-party services</h2>
        <p>
          OutfitsMe integrates with Google Gemini, Better Auth, PostgreSQL, and Supabase-backed storage services.
          Those providers may process limited data according to their own terms and privacy policies.
        </p>

        <h2>4. AI providers</h2>
        <p>
          The current experience uses a managed server-side AI integration. We do not require users to paste their own
          AI API keys into the frontend for the core product flow.
        </p>

        <h2>5. Security</h2>
        <p>
          We use reasonable safeguards, but no system is completely secure. You remain responsible for protecting your
          account credentials and Google sign-in access.
        </p>

        <h2>6. Contact</h2>
        <p>If you have privacy questions, contact the OutfitsMe team through the project support channel.</p>

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

