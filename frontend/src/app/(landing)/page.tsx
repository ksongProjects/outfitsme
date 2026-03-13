"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import dynamic from "next/dynamic";
import { items } from "@/components/custom/items";
const Masonry = dynamic(() => import("@/components/custom/Masonry"), {
  ssr: false,
});

const LightRays = dynamic(() => import("@/components/LightRays"), {
  ssr: false,
});

function LandingPage() {
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  return (
    <>
      <div className="absolute inset-0 -z-10">
        <LightRays
          raysOrigin="top-center"
          raysColor="#ffffff"
          raysSpeed={0.2}
          lightSpread={1.2}
          rayLength={2}
          followMouse={false}
          mouseInfluence={0}
          noiseAmount={0.28}
          distortion={0}
          className="custom-rays"
          pulsating={false}
          fadeDistance={0.6}
          saturation={2}
        />
      </div>
      <header>
        <div className="flex items-center gap-2 p-4">
          <Link href={"/"}>
            <Image src="/logo.png" alt="logo" width={50} height={50} />
          </Link>
          <h1>OutfitsMe</h1>
        </div>
      </header>
      <main>
        <div className="flex">
          <div className="w-2/3 p-4">
            <Masonry
              items={items}
              ease="power3.out"
              duration={3}
              stagger={0.3}
              animateFrom="bottom"
              scaleOnHover
              hoverScale={1.05}
              blurToFocus={false}
              colorShiftOnHover={false}
            />
          </div>

          <div>
            <section className="hero">
              <div>
                <h1>Find your style from photos.</h1>
                <p>
                  Upload outfit images, identify clothing items with AI, and try
                  them on using your profile photo.
                </p>
              </div>

              <form className="auth-panel card">
                <div className="auth-header">
                  <h2>Get Started</h2>
                  <p className="auth-subtext">
                    Sign in or create an account with Google
                  </p>
                </div>

                <div className="flex gap-2">
                  <Checkbox
                    id="accept-terms"
                    checked={acceptedTerms}
                    onCheckedChange={setAcceptedTerms}
                  />
                  <Label htmlFor="accept-terms">
                    I agree to the
                    <Link href="/terms" className="underline text-blue-300">
                      Terms of Service
                    </Link>
                  </Label>
                </div>
              </form>
            </section>

            <section className="feature-grid">
              <article className="feature-card">
                <h3>Analyze Outfit</h3>
                <p>
                  Upload a photo and select an area to identify style and
                  clothing items.
                </p>
              </article>
              <article className="feature-card">
                <h3>OutfitsMe Preview</h3>
                <p>
                  See personalized try-on previews from your analyzed and custom
                  outfits.
                </p>
              </article>
              <article className="feature-card">
                <h3>Build Wardrobe</h3>
                <p>Save, organize, and reuse looks in your digital wardrobe.</p>
              </article>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

export default LandingPage;
