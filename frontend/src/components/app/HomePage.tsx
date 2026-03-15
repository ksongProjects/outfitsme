"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Search, Settings2, Shirt, Sparkles, User } from "lucide-react";

import AppFooter from "@/components/app/AppFooter";
import AppLoadingScreen from "@/components/app/AppLoadingScreen";
import AnalyzeTab from "@/components/app/tabs/AnalyzeTab";
import DashboardTab from "@/components/app/tabs/DashboardTab";
import ItemsTab from "@/components/app/tabs/ItemsTab";
import OutfitsTab from "@/components/app/tabs/OutfitsTab";
import SettingsTab from "@/components/app/tabs/SettingsTab";
import { DashboardProviders } from "@/components/app/DashboardContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAnalysisState } from "@/hooks/use-analysis-state";
import { useAuthState } from "@/hooks/use-auth-state";
import { useHistoryState } from "@/hooks/use-history-state";
import { useItemsState } from "@/hooks/use-items-state";
import { useSettingsState } from "@/hooks/use-settings-state";
import { useStatsState } from "@/hooks/use-stats-state";
import { useWardrobeState } from "@/hooks/use-wardrobe-state";

const TAB_OPTIONS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "analyze", label: "Photo analysis", icon: Sparkles },
  { id: "wardrobe", label: "My outfits", icon: Shirt },
  { id: "items", label: "Item catalog", icon: Search },
  { id: "settings", label: "Settings", icon: Settings2 },
] as const;

type DashboardTabId = (typeof TAB_OPTIONS)[number]["id"];

export default function HomePage() {
  const router = useRouter();
  const [dashboardTab, setDashboardTab] = useState<DashboardTabId>("dashboard");

  const auth = useAuthState();
  const accessToken = auth.accessToken;

  const statsState = useStatsState({ accessToken });
  const analysisState = useAnalysisState({
    accessToken,
    onAnalysisSaved: () => {
      void statsState.loadStats();
    },
  });
  const wardrobeState = useWardrobeState({
    accessToken,
    onWardrobeChanged: () => {
      void statsState.loadStats();
    },
  });
  const itemsState = useItemsState({ accessToken });
  const historyState = useHistoryState({ accessToken });
  const settingsState = useSettingsState({
    session: auth.session,
    accessToken,
  });

  useEffect(() => {
    if (!auth.isLoading && !auth.session) {
      router.replace("/");
    }
  }, [auth.isLoading, auth.session, router]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    void statsState.loadStats();
    void analysisState.loadModels();
    void analysisState.loadAnalysisLimits();
    void settingsState.loadPreferences();
    void settingsState.loadCosts();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    if (dashboardTab === "wardrobe") {
      void wardrobeState.loadWardrobe();
    }
    if (dashboardTab === "items") {
      void itemsState.loadItems();
    }
    if (dashboardTab === "dashboard" || dashboardTab === "analyze") {
      void historyState.loadHistory();
    }
  }, [dashboardTab, accessToken]);

  const handleTabChange = (nextTab: DashboardTabId) => {
    setDashboardTab(nextTab);
  };

  const handleSignOut = async () => {
    await auth.signOut();
    analysisState.resetAnalysisState();
    wardrobeState.resetWardrobeState();
    itemsState.resetItemsState();
    historyState.resetHistoryState();
    handleTabChange("dashboard");
    router.replace("/");
  };

  const authValue = {
    ...auth,
    signOut: handleSignOut,
  };

  const userFullName = (auth.session?.user?.name || "").trim();
  const userEmail = auth.session?.user?.email || "";
  const userLabel = userFullName || userEmail || "your account";

  if (auth.isLoading) {
    return (
      <AppLoadingScreen
        title="Preparing OutfitsMe"
        subtitle="Checking your session and restoring the right outfit experience."
      />
    );
  }

  if (!auth.session) {
    return (
      <AppLoadingScreen
        title="Heading back to the landing page"
        subtitle="Your dashboard is protected, so we are redirecting you to the public experience."
      />
    );
  }

  return (
    <DashboardProviders
      authValue={authValue}
      analysisValue={analysisState}
      wardrobeValue={wardrobeState}
      itemsValue={itemsState}
      historyValue={historyState}
      settingsValue={settingsState}
    >
      <main className="dashboard-shell">
        <div className="dashboard-background-orb dashboard-background-orb-a" />
        <div className="dashboard-background-orb dashboard-background-orb-b" />

        <header className="dashboard-header">
          <div className="dashboard-header-copy">
            <button type="button" className="brand-button dashboard-brand-button" onClick={() => handleTabChange("dashboard")}>
              <span className="brand-lockup">
                <span className="brand-mark" aria-hidden="true">
                  <Image src="/logo.png" alt="" width={40} height={40} className="brand-mark-image" priority />
                </span>
                <span>
                  <span className="brand-name">OutfitsMe</span>
                </span>
              </span>
            </button>
            <h2>{userFullName ? `Welcome back, ${userFullName}` : "Welcome back"}</h2>
            <p className="subtext">
              {userFullName
                ? "Your style workspace is synced and ready for the next outfit."
                : `Signed in as ${userLabel}`}
            </p>
          </div>

          <div className="dashboard-user-actions">
            <DropdownMenu>
              <DropdownMenuTrigger className="hero-badge-button" aria-label="Account menu">
                <Avatar
                  size="lg"
                  className="hero-badge"
                  aria-label={settingsState.profilePhotoUrl ? "Profile photo uploaded" : "Default profile badge"}
                >
                  {settingsState.profilePhotoUrl ? (
                    <AvatarImage src={settingsState.profilePhotoUrl} alt="Profile badge" className="hero-badge-image" />
                  ) : null}
                  <AvatarFallback className="hero-badge-fallback">
                    <User size={22} />
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="avatar-menu-content">
                <DropdownMenuLabel className="avatar-menu-label">
                  <p className="avatar-menu-name">{userFullName || "OutfitsMe account"}</p>
                  {userEmail ? <p className="avatar-menu-email">{userEmail}</p> : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="avatar-menu-item" onClick={() => handleTabChange("settings")}>
                  <Settings2 size={16} />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="avatar-menu-item" variant="danger" onClick={handleSignOut}>
                  <LogOut size={16} />
                  <span>Sign out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <section className="dashboard-stage">
          <nav className="tab-row" aria-label="Dashboard sections">
            {TAB_OPTIONS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === dashboardTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab-btn ${isActive ? "active" : ""}`}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <Icon size={16} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <section className="card dashboard-card-shell">
            {dashboardTab === "dashboard" ? (
              <DashboardTab
                stats={statsState.stats}
                refreshStats={async () => {
                  await statsState.loadStats();
                  await analysisState.loadAnalysisLimits();
                  await historyState.loadHistory(true);
                }}
                loading={statsState.statsLoading || analysisState.limitsLoading || historyState.historyLoading}
                analysisLimits={analysisState.analysisLimits}
                limitsLoading={analysisState.limitsLoading}
                history={historyState.history}
                historyLoading={historyState.historyLoading}
              />
            ) : null}
            {dashboardTab === "analyze" ? <AnalyzeTab /> : null}
            {dashboardTab === "wardrobe" ? <OutfitsTab /> : null}
            {dashboardTab === "items" ? <ItemsTab /> : null}
            {dashboardTab === "settings" ? <SettingsTab /> : null}
          </section>
        </section>

        <AppFooter />
      </main>
    </DashboardProviders>
  );
}
