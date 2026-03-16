"use client";

import Image from "next/image";

import { Card } from "@/components/ui/card";

type AppLoadingScreenProps = {
  title?: string;
  subtitle?: string;
};

export default function AppLoadingScreen({
  title = "Preparing OutfitsMe",
  subtitle = "Checking your session and loading the right workspace.",
}: AppLoadingScreenProps) {
  return (
    <main className="dashboard-shell app-loading-shell" aria-live="polite">
      <div className="dashboard-background-orb dashboard-background-orb-a" />
      <div className="dashboard-background-orb dashboard-background-orb-b" />

      <section className="app-loading-stage">
        <Card as="section" className="c-surface dashboard-card-shell app-loading-card o-grid">
          <div className="app-loading-head o-stack o-stack--center">
            <div className="app-loading-mark" aria-hidden="true">
              <Image src="/logo.png" alt="" width={44} height={44} priority className="app-loading-mark-image" />
            </div>
            <div className="app-loading-copy o-stack o-stack--tight o-stack--center">
              <span className="section-kicker">Loading experience</span>
              <h2>{title}</h2>
              <p className="subtext">{subtitle}</p>
            </div>
          </div>

          <div className="app-loading-layout o-grid" aria-hidden="true">
            <div className="app-loading-panel o-grid">
              <span className="app-loading-line app-loading-line-lg" />
              <span className="app-loading-line app-loading-line-md" />
              <span className="app-loading-line app-loading-line-sm" />
            </div>
            <div className="app-loading-panel app-loading-panel-accent o-grid">
              <span className="app-loading-pill" />
              <span className="app-loading-line app-loading-line-md" />
              <span className="app-loading-line app-loading-line-sm" />
            </div>
            <div className="app-loading-strip" />
            <div className="app-loading-grid-span o-grid o-grid--thirds">
              <div className="app-loading-metric" />
              <div className="app-loading-metric" />
              <div className="app-loading-metric" />
            </div>
          </div>
        </Card>
      </section>
    </main>
  );
}

