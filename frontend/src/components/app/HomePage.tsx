"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, LogOut, Search, Settings2, Shirt, Sparkles, User } from "lucide-react";

import AppFooter from "@/components/app/AppFooter";
import AppHeader from "@/components/app/AppHeader";
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

const NAV_TAB_OPTIONS = [
  { id: "dashboard", label: "Home", icon: LayoutDashboard },
  { id: "analyze", label: "Photo analysis", icon: Sparkles },
  { id: "wardrobe", label: "My outfits", icon: Shirt },
  { id: "items", label: "Item catalog", icon: Search },
] as const;

type DashboardTabId = ((typeof NAV_TAB_OPTIONS)[number]["id"]) | "settings";

export default function HomePage() {
  const router = useRouter();
  const [dashboardTab, setDashboardTab] = useState<DashboardTabId>("dashboard");
  const hasRetriedSessionRef = useRef(false);

  const auth = useAuthState();
  const accessToken = auth.accessToken;

  const statsState = useStatsState({ accessToken });
  const analysisState = useAnalysisState({ accessToken });
  const wardrobeState = useWardrobeState({ accessToken });
  const itemsState = useItemsState({ accessToken });
  const historyState = useHistoryState({ accessToken });
  const settingsState = useSettingsState({
    session: auth.session,
    accessToken,
  });

  const retrySession = useEffectEvent(() => {
    void auth.refetchSession();
  });

  useEffect(() => {
    if (auth.session) {
      hasRetriedSessionRef.current = false;
      return;
    }

    if (auth.isLoading || (auth.isSessionRefetching && !auth.sessionError) || hasRetriedSessionRef.current) {
      return;
    }

    hasRetriedSessionRef.current = true;
    retrySession();
  }, [auth.isLoading, auth.isSessionRefetching, auth.session, auth.sessionError]);

  useEffect(() => {
    if (auth.isLoading || (auth.isSessionRefetching && !auth.sessionError) || auth.session) {
      return;
    }

    if (!hasRetriedSessionRef.current) {
      return;
    }

    router.replace("/");
  }, [auth.isLoading, auth.isSessionRefetching, auth.session, auth.sessionError, router]);

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

  if (auth.isLoading || (auth.isSessionRefetching && !auth.sessionError)) {
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

        <AppHeader
          className="dashboard-header"
          onBrandClick={() => handleTabChange("dashboard")}
          actions={(
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
          )}
        >
          <div className="dashboard-header-copy">
            <h3>{userFullName ? `Welcome back, ${userFullName}` : "Welcome back"}</h3>
            <p className="subtext">
              {userFullName
                ? "Your style workspace is synced and ready for the next outfit."
                : `Signed in as ${userLabel}`}
            </p>
          </div>
        </AppHeader>

        <section className="dashboard-stage">
          <nav className="tab-row" aria-label="Dashboard sections">
            {NAV_TAB_OPTIONS.map((tab) => {
              const Icon = tab.icon;
              const isActive = tab.id === dashboardTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`tab-btn ${isActive ? "active" : ""}`}
                  aria-label={tab.label}
                  onClick={() => handleTabChange(tab.id)}
                >
                  <Icon size={16} />
                  <span className="tab-btn-label">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          <section className="c-surface dashboard-card-shell">
            {dashboardTab === "dashboard" ? (
              <DashboardTab
                stats={statsState.stats}
                refreshStats={async () => {
                  await Promise.all([
                    statsState.refreshStats(),
                    analysisState.refreshAnalysisLimits(),
                    historyState.refreshHistory(),
                  ]);
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

