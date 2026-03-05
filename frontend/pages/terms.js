import Link from "next/link";
import AppFooter from "../components/AppFooter";

export default function TermsPage() {
  return (
    <main className="landing">
      <section className="card terms-card">
        <h1>OutfitsMe Terms of Service</h1>
        <p className="subtext">Last updated: March 5, 2026</p>

        <h2>1. Service Requirements</h2>
        <p>
          OutfitsMe requires a valid Google Gemini API key to run analysis and generation features.
          Without a Gemini key, core functionality is unavailable.
        </p>

        <h2>2. Your API Key and Billing</h2>
        <p>
          You are responsible for your Gemini API key usage and any charges billed by Google.
          For image generation features, your Google account must have billing enabled.
        </p>

        <h2>3. User Content</h2>
        <p>
          You retain ownership of images and content you upload. By using the service, you grant us
          permission to process your content to provide analysis, outfit previews, and related features.
        </p>

        <h2>4. Acceptable Use</h2>
        <p>
          You agree not to use OutfitsMe for unlawful, abusive, or harmful content or activities.
          We may suspend access for misuse.
        </p>

        <h2>5. Availability and Changes</h2>
        <p>
          We may modify or discontinue features at any time. Service availability is not guaranteed.
        </p>

        <h2>6. Disclaimer and Liability</h2>
        <p>
          OutfitsMe is provided &quot;as is&quot; without warranties. To the maximum extent permitted by law,
          we are not liable for indirect or consequential damages.
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
