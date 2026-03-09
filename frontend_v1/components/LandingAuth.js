import { useAuthContext } from "../context/DashboardContext";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import BaseButton from "./ui/BaseButton";
import AppFooter from "./AppFooter";

export default function LandingAuth() {
  const TERMS_VERSION = "2026-03-05";
  const { handleGoogleSignIn, isSigningIn } = useAuthContext();
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!acceptedTerms) {
      toast.error("You must accept the Terms of Service to create an account.");
      return;
    }
    await handleGoogleSignIn(acceptedTerms, TERMS_VERSION);
  };

  return (
    <main className="landing">
      <header className="topbar">
        <div className="brand">OutfitsMe</div>
      </header>

      <section className="hero">
        <div>
          <h1>Find your style from photos.</h1>
          <p className="hero-copy">
            Upload outfit images, identify clothing items with AI, and use OutfitsMe to preview looks on your own profile photo.
          </p>
        </div>

        <form className="auth-panel card" onSubmit={handleSubmit}>
          <div className="auth-header">
            <h2>Get Started</h2>
            <p className="auth-subtext">Sign in or create an account with Google</p>
          </div>

          <div className="form-btn-container">
            <label className="remember-me-row">
              <input
                type="checkbox"
                checked={acceptedTerms}
                onChange={(event) => setAcceptedTerms(event.target.checked)}
              />
              <span>
                I agree to the <Link href="/terms">Terms of Service</Link>.
              </span>
            </label>

            <BaseButton 
              type="submit" 
              variant="primary" 
              disabled={!acceptedTerms || isSigningIn}
              style={{ width: '100%' }}
            >
              {isSigningIn ? "Signing in..." : "Continue with Google"}
            </BaseButton>
          </div>
        </form>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Analyze Outfit</h3>
          <p>Upload a photo and select an area to identify style and clothing items.</p>
        </article>
        <article className="feature-card">
          <h3>OutfitsMe Preview</h3>
          <p>See personalized try-on previews from your analyzed and custom outfits.</p>
        </article>
        <article className="feature-card">
          <h3>Build Wardrobe</h3>
          <p>Save, organize, and reuse looks in your digital wardrobe.</p>
        </article>
      </section>
      <AppFooter />
    </main>
  );
}

