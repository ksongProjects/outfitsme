"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight, LogIn, SearchIcon, ShirtIcon, Wand2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import AppFooter from "@/components/app/AppFooter";
import AppHeader from "@/components/app/AppHeader";
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
        <AppHeader />

        <section className="landing-columns">
          <div className="o-stack">
            <div className="hero-copy">
              <span className="hero-pill">A simpler way to plan outfits</span>
              <h3>Save outfit ideas, spot what you are wearing, and try new looks faster.</h3>
              <p className="hero-copy-text">
                Upload a photo, pull out the pieces, save the look, and come back anytime when you want to remix it or preview something new.
              </p>
            </div>

            <div className="o-grid o-grid--thirds">
              <article className="c-surface o-stack o-stack--tight">
                <div className="o-media o-media--tight">
                  <SearchIcon size={18} className="feature-icon" />
                  <h3>Analyze</h3>
                </div>
                <p>See the clothes in a photo and get a quick read on the overall look.</p>
              </article>
              <article className="c-surface o-stack o-stack--tight">
                <div className="o-media o-media--tight">
                  <Wand2 size={18} className="feature-icon" />
                  <h3>Preview</h3>
                </div>
                <p>Try fresh outfit ideas with a preview that feels personal to you.</p>
              </article>
              <article className="c-surface o-stack o-stack--tight">
                <div className="o-media o-media--tight">
                  <ShirtIcon size={18} className="feature-icon" />
                  <h3>Organize</h3>
                </div>
                <p>Keep your favorite looks and pieces in one easy place.</p>
              </article>
            </div>

            <section className="c-surface c-surface--stack">
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
                  I agree to the <Link href="/terms" className="underline">Terms of Service</Link> and understand this trial tracks usage while I explore OutfitsMe.
                </span>
              </label>
              <div className="o-cluster o-cluster--wrap o-cluster--end o-cluster--stack-sm">
                <BaseButton
                  type="button"
                  variant="ghost"
                  disabled={activeAuthFlow !== null}
                  className="auth-secondary-btn"
                  onClick={() => void handleGoogleAuth("signin")}
                >
                  {activeAuthFlow === "signin" ? "Signing in..." : "Continue with Google"}
                  <LogIn size={16} />
                </BaseButton>
                <BaseButton
                  type="button"
                  variant="primary"
                  disabled={!acceptedTerms || activeAuthFlow !== null}
                  className="auth-submit-btn"
                  onClick={() => void handleGoogleAuth("signup")}
                >
                  {activeAuthFlow === "signup" ? "Creating account..." : "Create account"}
                  <ArrowRight size={16} />
                </BaseButton>
              </div>
            </section>
          </div>

          <div className="o-stack" aria-hidden="true">
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
