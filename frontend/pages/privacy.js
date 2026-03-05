import Link from "next/link";
import AppFooter from "../components/AppFooter";

export default function PrivacyPage() {
  return (
    <main className="landing">
      <section className="card terms-card">
        <h1>OutfitsMe Privacy Policy</h1>
        <p className="subtext">Last updated: March 5, 2026</p>

        <h2>1. Data We Process</h2>
        <p>
          We process account information, uploaded images, model settings, and generated outputs to provide
          analysis and outfit features.
        </p>

        <h2>2. How We Use Data</h2>
        <p>
          Your data is used to operate, maintain, and improve OutfitsMe features, including analysis jobs
          and preview generation.
        </p>

        <h2>3. Third-Party Services</h2>
        <p>
          OutfitsMe integrates with external providers including Google Gemini and Supabase. Their services
          may process data according to their own terms and privacy policies.
        </p>

        <h2>4. API Keys</h2>
        <p>
          Gemini API keys provided in settings are stored securely and used only to execute requested model
          operations on your behalf.
        </p>

        <h2>5. Security</h2>
        <p>
          We use reasonable safeguards, but no system is completely secure. You are responsible for protecting
          your account credentials.
        </p>

        <h2>6. Contact</h2>
        <p>
          If you have privacy questions, contact the OutfitsMe team through your project support channel.
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
