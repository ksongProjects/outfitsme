"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, LogIn, SearchIcon, ShirtIcon, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import AppFooter from "@/components/app/AppFooter";
import BaseButton from "@/components/app/ui/BaseButton";
import BaseCheckbox from "@/components/app/ui/BaseCheckbox";
import { items } from "@/components/custom/items";
import { signIn } from "@/lib/auth-client";

const Masonry = dynamic(() => import("@/components/custom/Masonry"), {
  ssr: false,
});

export default function LandingAuth() {
  const termsVersion = "2026-03-05";
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [activeAuthFlow, setActiveAuthFlow] = useState<"signin" | "signup" | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const authError = (searchParams.get("error") || "").trim().toLowerCase();
    if (!authError) {
      return;
    }

    const authFlow = (searchParams.get("authFlow") || "").trim().toLowerCase();
    const errorDescription = (searchParams.get("error_description") || "").trim();
    let message = errorDescription || "Google sign-in failed. Please try again.";

    if (authError === "signup_disabled") {
      message = authFlow === "signin"
        ? "No OutfitsMe account exists for that Google login yet. Accept the terms first if you want to create one."
        : "Account creation is currently unavailable for that Google login.";
    } else if (authError === "account_not_linked") {
      message = "This Google account is not linked to your existing OutfitsMe account.";
    } else if (authError === "unable_to_link_account") {
      message = "We couldn't connect that Google account to OutfitsMe.";
    }

    toast.error(message);
    router.replace("/");
  }, [router, searchParams]);

  const handleGoogleAuth = async (mode: "signin" | "signup") => {
    if (!acceptedTerms && mode === "signup") {
      toast.error("You must accept the Terms of Service to create an account.");
      return;
    }

    try {
      setActiveAuthFlow(mode);
      await signIn.social(
        {
          provider: "google",
          callbackURL: "/dashboard",
          errorCallbackURL: mode === "signin" ? "/?authFlow=signin" : "/?authFlow=signup",
          ...(mode === "signup"
            ? {
                requestSignUp: true,
                newUserCallbackURL: "/dashboard",
              }
            : {}),
        },
        {
          onSuccess: () => {
            toast.success(mode === "signin" ? "Signed in successfully with Google." : "Account created successfully with Google.");
          },
          onError: (ctx) => {
            toast.error(ctx.error?.message || "Google sign-in failed. Please try again.");
            setActiveAuthFlow(null);
          },
        }
      );
    } catch {
      toast.error("Google sign-in failed. Please try again.");
      setActiveAuthFlow(null);
    }

    void termsVersion;
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

            <section className="auth-panel card">
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
              <div className="auth-button-row">
                <BaseButton
                  type="button"
                  variant="ghost"
                  disabled={activeAuthFlow !== null}
                  className="auth-secondary-btn"
                  onClick={() => void handleGoogleAuth("signin")}
                >
                  {activeAuthFlow === "signin" ? "Signing in..." : "Sign in with Google"}
                  <LogIn size={16} />
                </BaseButton>
                <BaseButton
                  type="button"
                  variant="primary"
                  disabled={!acceptedTerms || activeAuthFlow !== null}
                  className="auth-submit-btn"
                  onClick={() => void handleGoogleAuth("signup")}
                >
                  {activeAuthFlow === "signup" ? "Creating account..." : "Sign up with Google"}
                  <ArrowRight size={16} />
                </BaseButton>
              </div>
            </section>
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
