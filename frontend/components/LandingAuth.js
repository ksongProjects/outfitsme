import { useAuthContext } from "../context/DashboardContext";
import { Tabs } from "@base-ui/react/tabs";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import BaseButton from "./ui/BaseButton";
import BaseInput from "./ui/BaseInput";
import AppFooter from "./AppFooter";

export default function LandingAuth() {
  const TERMS_VERSION = "2026-03-05";
  const {
    authTab,
    setAuthTab,
    email,
    rememberMe,
    password,
    setEmail,
    setRememberMe,
    setPassword,
    submitAuth
  } = useAuthContext();
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async (event) => {
    if (authTab === "signup" && !acceptedTerms) {
      event.preventDefault();
      toast.error("You must accept the Terms of Service to create an account.");
      return;
    }
    await submitAuth(event, {
      acceptedTerms,
      termsVersion: TERMS_VERSION
    });
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
          <div className="hero-actions">
            <BaseButton variant="primary" onClick={() => setAuthTab("signup")}>Create your account</BaseButton>
          </div>
        </div>

        <form className="auth-panel card" onSubmit={handleSubmit}>
          <Tabs.Root value={authTab} onValueChange={(nextValue) => setAuthTab(nextValue)}>
            <Tabs.List className="tab-row">
              <Tabs.Tab className="tab-btn" value="signin">Sign in</Tabs.Tab>
              <Tabs.Tab className="tab-btn" value="signup">Sign up</Tabs.Tab>
            </Tabs.List>
          </Tabs.Root>

          <BaseInput
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <BaseInput
            type="password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="form-btn-container">
            {authTab === "signin" ? (
              <label className="remember-me-row">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(event) => setRememberMe(event.target.checked)}
                />
                <span>Remember me</span>
              </label>
            ) : (
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
            )}

            {authTab === "signin" ? (
              <BaseButton type="submit" variant="primary">Continue to dashboard</BaseButton>
            ) : (
              <BaseButton type="submit" variant="primary" disabled={!acceptedTerms}>
                Create account
              </BaseButton>
            )}
          </div>
        </form>
      </section>

      <section className="feature-grid">
        <article className="feature-card">
          <h3>Analyze Outfit</h3>
          <p>Upload one photo to instantly identify style and clothing pieces.</p>
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

