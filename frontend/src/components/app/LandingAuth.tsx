"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Search, SearchIcon, Shirt, ShirtIcon, Wand2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import AppFooter from "@/components/app/AppFooter";
import { useAuthContext } from "@/components/app/DashboardContext";
import BaseButton from "@/components/app/ui/BaseButton";
import BaseCheckbox from "@/components/app/ui/BaseCheckbox";
import { items } from "@/components/custom/items";

const Masonry = dynamic(() => import("@/components/custom/Masonry"), {
  ssr: false,
});

export default function LandingAuth() {
  const termsVersion = "2026-03-05";
  const { handleGoogleSignIn, isSigningIn } = useAuthContext();
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!acceptedTerms) {
      toast.error("You must accept the Terms of Service to create an account.");
      return;
    }
    await handleGoogleSignIn(acceptedTerms, termsVersion);
  };

  return (
    <main className="landing-shell">
      <div className="landing-page">
        <header className="landing-topbar">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              <Image
                src="/logo.png"
                alt=""
                width={40}
                height={40}
                className="brand-mark-image"
                priority
              />
            </div>
            <div>
              <p className="brand-name">OutfitsMe</p>
              <p className="brand-tagline">
                AI styling, wardrobe memory, and outfit previews in one workflow.
              </p>
            </div>
          </div>
        </header>

        <section className="landing-columns">
          <div className="landing-content-column">
            <div className="hero-copy">
              <span className="hero-pill">From inspiration to wardrobe system</span>
              <h3>Turn outfit photos into a searchable, reusable styling workspace.</h3>
              <p className="hero-copy-text">
                Upload a look, identify the pieces, save the outfit, then generate fresh combinations and preview them on your own reference photo.
              </p>
            </div>

            <div className="hero-value-grid">
              <article className="feature-card">
                <div className="feature-card-title-row">
                  <SearchIcon size={18} className="feature-icon" />
                  <h3>Analyze</h3>
                </div>
                <p>Detect style, clothing items, and accessories from a single photo.</p>
              </article>
              <article className="feature-card">
                <div className="feature-card-title-row">
                  <Wand2 size={18} className="feature-icon" />
                  <h3>Preview</h3>
                </div>
                <p>Generate a personalized try-on style reference.</p>
              </article>
              <article className="feature-card">
                <div className="feature-card-title-row">
                  <ShirtIcon size={18} className="feature-icon" />
                  <h3>Organize</h3>
                </div>
                <p>Build a wardrobe memory you can filter, remix, and revisit.</p>
              </article>
            </div>

            <form className="auth-panel card" onSubmit={handleSubmit}>
              <div className="auth-header">
                <span className="section-kicker">Get started</span>
              </div>

              <label className="remember-me-row" htmlFor="accept-terms">
                <BaseCheckbox
                  id="accept-terms"
                  checked={acceptedTerms}
                  onCheckedChange={(checked) => setAcceptedTerms(Boolean(checked))}
                />
                <span>
                  I agree to the <Link href="/terms" className="underline">Terms of Service</Link> and understand this version tracks usage under the managed trial.
                </span>
              </label>
              <div className="flex justify-end">
                <BaseButton
                  type="submit"
                  variant="primary"
                  disabled={!acceptedTerms || isSigningIn}
                  className="auth-submit-btn"
                >
                  {isSigningIn ? "Signing in..." : "Continue with Google"}
                  <ArrowRight size={16} />
                </BaseButton>
              </div>
            </form>
          </div>

          <div className="landing-visual-column" aria-hidden="true">
            <div className="masonry-stage">
              <Masonry
                items={items}
                ease="power3.out"
                duration={3}
                stagger={0.3}
                animateFrom="bottom"
                scaleOnHover
                hoverScale={1.04}
                blurToFocus={false}
                colorShiftOnHover={false}
              />
            </div>
          </div>
        </section>

        <AppFooter />
      </div>
    </main>
  );
}
