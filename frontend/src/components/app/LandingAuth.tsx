"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import AppFooter from "@/components/app/AppFooter";
import AppHeader from "@/components/app/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { items } from "@/components/custom/items";
import { signIn } from "@/lib/auth-client";

const Masonry = dynamic(() => import("@/components/custom/Masonry"), {
  ssr: false,
});

export default function LandingAuth() {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const authError = (searchParams.get("error") || "").trim().toLowerCase();
    if (!authError) {
      return;
    }

    const errorDescription = (
      searchParams.get("error_description") || ""
    ).trim();
    let message =
      errorDescription || "Google sign-in failed. Please try again.";

    if (authError === "signup_disabled") {
      message =
        "We couldn't finish Google sign-in. Please try again.";
    } else if (authError === "account_not_linked") {
      message =
        "This Google account is not linked to your existing OutfitsMe account.";
    } else if (authError === "unable_to_link_account") {
      message = "We couldn't connect that Google account to OutfitsMe.";
    }

    toast.error(message);
    router.replace("/");
  }, [router, searchParams]);

  useEffect(() => {
    const resetAuthFlow = () => {
      setIsAuthenticating(false);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        resetAuthFlow();
      }
    };

    window.addEventListener("pageshow", resetAuthFlow);
    window.addEventListener("focus", resetAuthFlow);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", resetAuthFlow);
      window.removeEventListener("focus", resetAuthFlow);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handleGoogleAuth = async () => {
    try {
      setIsAuthenticating(true);
      await signIn.social(
        {
          provider: "google",
          callbackURL: "/dashboard",
          errorCallbackURL: "/",
          newUserCallbackURL: "/dashboard",
          requestSignUp: true,
        },
        {
          onSuccess: () => {
            toast.success("Signed in successfully with Google.");
          },
          onError: (ctx) => {
            toast.error(
              ctx.error?.message || "Google sign-in failed. Please try again.",
            );
            setIsAuthenticating(false);
          },
        },
      );
    } catch {
      toast.error("Google sign-in failed. Please try again.");
      setIsAuthenticating(false);
    }
  };

  return (
    <main className="landing-shell">
      <div className="landing-page">
        <AppHeader />

        <section className="landing-columns">
          <div className="o-stack landing-copy-column">
            <Card
              as="section"
              className="c-surface c-surface--stack landing-hero-card"
            >
              <span className="section-kicker">
                Personal styling, simplified
              </span>
              <div className="o-stack o-stack--tight o-stack--start">
                <h2 className="landing-hero-title">
                  Your personal style, made simpler.
                </h2>
                <p className="hero-copy-text landing-hero-summary">
                  Find outfit inspiration, create your own, and enjoy 14 days
                  free.
                </p>
                <p className="subtext landing-hero-detail">
                  Upload a look you like, break it into pieces, and turn it into
                  outfits you can refine and preview in minutes.
                </p>
              </div>

              <ol
                className="landing-process-list"
                aria-label="How OutfitsMe works"
              >
                <li className="landing-process-step">
                  <div className="o-stack o-stack--tight">
                    <div className="flex items-center gap-2">
                      <span className="landing-process-number">1</span>
                      <strong>Get inspired</strong>
                    </div>
                    <span>
                      Start from a photo, a vibe, or pieces already in your
                      closet.
                    </span>
                  </div>
                </li>
                <li className="landing-process-step">
                  <div className="o-stack o-stack--tight">
                    <div className="flex items-center gap-2">
                      <span className="landing-process-number">2</span>
                      <strong>Create your look</strong>
                    </div>
                    <span>
                      Mix and match items to build outfits that feel more like
                      you.
                    </span>
                  </div>
                </li>
                <li className="landing-process-step">
                  <div className="o-stack o-stack--tight">
                    <div className="flex items-center gap-2">
                      <span className="landing-process-number">3</span>
                      <strong>Preview before you wear</strong>
                    </div>
                    <span>
                      See how new combinations come together before making a
                      call.
                    </span>
                  </div>
                </li>
              </ol>
            </Card>

            <Card
              as="section"
              className="c-surface c-surface--stack landing-auth-card"
            >
              <div className="auth-header">
                <span className="section-kicker">Get started</span>
              </div>

              <div className="o-cluster o-cluster--wrap o-cluster--start o-cluster--stack-sm">
                <Button
                  type="button"
                  disabled={isAuthenticating}
                  onClick={() => void handleGoogleAuth()}
                >
                  {isAuthenticating
                    ? "Continuing..."
                    : "Continue with Google"}
                  <LogIn size={16} />
                </Button>
              </div>
              <p className="subtext">
                By continuing with Google, you agree to the{" "}
                <Link href="/terms" className="underline">
                  Terms of Service
                </Link>{" "}
                and{" "}
                <Link href="/privacy" className="underline">
                  Privacy Policy
                </Link>
                .
              </p>
            </Card>
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
