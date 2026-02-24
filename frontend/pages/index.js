import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { User } from "lucide-react";

import LandingAuth from "../components/LandingAuth";
import DashboardTab from "../components/tabs/DashboardTab";
import AnalyzeTab from "../components/tabs/AnalyzeTab";
import OutfitsTab from "../components/tabs/OutfitsTab";
import ItemsTab from "../components/tabs/ItemsTab";
import SettingsTab from "../components/tabs/SettingsTab";
import { DashboardProviders } from "../context/DashboardContext";
import { useAuthState } from "../hooks/useAuthState";
import { useStatsState } from "../hooks/useStatsState";
import { useAnalysisState } from "../hooks/useAnalysisState";
import { useWardrobeState } from "../hooks/useWardrobeState";
import { useItemsState } from "../hooks/useItemsState";
import { useHistoryState } from "../hooks/useHistoryState";
import { useSettingsState } from "../hooks/useSettingsState";

export default function HomePage() {
  const [dashboardTab, setDashboardTab] = useState("dashboard");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  const auth = useAuthState();
  const accessToken = auth.session?.access_token || "";

  const statsState = useStatsState({ accessToken });
  const analysisState = useAnalysisState({
    accessToken,
    onAnalysisSaved: () => statsState.loadStats()
  });
  const wardrobeState = useWardrobeState({
    accessToken,
    onWardrobeChanged: () => statsState.loadStats()
  });
  const itemsState = useItemsState({ accessToken });
  const historyState = useHistoryState({ accessToken });
  const settingsState = useSettingsState({
    session: auth.session,
    accessToken,
    onModelSettingsUpdated: () => analysisState.loadModels()
  });

  useEffect(() => {
    if (!accessToken) {
      return;
    }
    statsState.loadStats();
    analysisState.loadModels();
    analysisState.loadAnalysisLimits();
    settingsState.loadModelSettings();
    settingsState.loadCosts();
  }, [accessToken]);

  useEffect(() => {
    if (dashboardTab === "wardrobe" && accessToken) {
      wardrobeState.loadWardrobe();
    }
  }, [dashboardTab, accessToken]);

  useEffect(() => {
    if (dashboardTab === "items" && accessToken) {
      itemsState.loadItems();
    }
  }, [dashboardTab, accessToken]);

  useEffect(() => {
    if (dashboardTab === "dashboard" && accessToken) {
      historyState.loadHistory();
    }
  }, [dashboardTab, accessToken]);

  useEffect(() => {
    if (dashboardTab === "analyze" && accessToken) {
      historyState.loadHistory();
    }
  }, [dashboardTab, accessToken]);

  const handleSignOut = useCallback(async () => {
    setAccountMenuOpen(false);
    await auth.signOut();
    analysisState.resetAnalysisState();
    wardrobeState.resetWardrobeState();
    itemsState.resetItemsState();
    historyState.resetHistoryState();
    setDashboardTab("dashboard");
  }, [
    auth.signOut,
    analysisState.resetAnalysisState,
    wardrobeState.resetWardrobeState,
    itemsState.resetItemsState,
    historyState.resetHistoryState
  ]);

  useEffect(() => {
    if (!accountMenuOpen) {
      return undefined;
    }

    const handleDocumentPointerDown = (event) => {
      if (!accountMenuRef.current) {
        return;
      }
      if (!accountMenuRef.current.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };

    const handleDocumentKeyDown = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleDocumentPointerDown);
    document.addEventListener("keydown", handleDocumentKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleDocumentPointerDown);
      document.removeEventListener("keydown", handleDocumentKeyDown);
    };
  }, [accountMenuOpen]);

  const authValue = useMemo(() => ({
    authTab: auth.authTab,
    setAuthTab: auth.setAuthTab,
    email: auth.email,
    password: auth.password,
    setEmail: auth.setEmail,
    setPassword: auth.setPassword,
    submitAuth: auth.submitAuth,
    session: auth.session,
    signOut: handleSignOut
  }), [auth.authTab, auth.email, auth.password, auth.session, handleSignOut]);

  const analysisValue = useMemo(() => ({
    previewUrl: analysisState.previewUrl,
    onFileChange: analysisState.onFileChange,
    onFileDrop: analysisState.onFileDrop,
    fileName: analysisState.fileName,
    clearSelectedFile: analysisState.clearSelectedFile,
    cropArea: analysisState.cropArea,
    setCropArea: analysisState.setCropArea,
    runAnalysis: analysisState.runAnalysis,
    disabled: analysisState.disabled,
    loading: analysisState.loading,
    analysis: analysisState.analysis,
    similarResults: analysisState.similarResults,
    selectedModel: analysisState.selectedModel,
    setSelectedModel: analysisState.setSelectedModel,
    modelOptions: analysisState.modelOptions,
    jobStatus: analysisState.jobStatus,
    activeAnalysisCount: analysisState.activeAnalysisCount,
    maxConcurrentAnalysisJobs: analysisState.maxConcurrentAnalysisJobs,
    analysisLimits: analysisState.analysisLimits,
    limitsLoading: analysisState.limitsLoading,
    error: analysisState.error,
    info: analysisState.info
  }), [
    analysisState.previewUrl,
    analysisState.fileName,
    analysisState.cropArea,
    analysisState.disabled,
    analysisState.loading,
    analysisState.analysis,
    analysisState.similarResults,
    analysisState.selectedModel,
    analysisState.modelOptions,
    analysisState.jobStatus,
    analysisState.activeAnalysisCount,
    analysisState.maxConcurrentAnalysisJobs,
    analysisState.analysisLimits,
    analysisState.limitsLoading,
    analysisState.error,
    analysisState.info
  ]);

  const wardrobeValue = useMemo(() => ({
    wardrobe: wardrobeState.wardrobe,
    wardrobeLoading: wardrobeState.wardrobeLoading,
    wardrobeMessage: wardrobeState.wardrobeMessage,
    loadWardrobe: wardrobeState.loadWardrobe,
    deleteWardrobeEntry: wardrobeState.deleteWardrobeEntry,
    deletingOutfitId: wardrobeState.deletingOutfitId,
    renameOutfit: wardrobeState.renameOutfit,
    updatingOutfitId: wardrobeState.updatingOutfitId,
    openOutfitDetails: wardrobeState.openOutfitDetails,
    closeOutfitDetails: wardrobeState.closeOutfitDetails,
    outfitDetails: wardrobeState.outfitDetails,
    outfitDetailsLoading: wardrobeState.outfitDetailsLoading
  }), [
    wardrobeState.wardrobe,
    wardrobeState.wardrobeLoading,
    wardrobeState.wardrobeMessage,
    wardrobeState.deletingOutfitId,
    wardrobeState.updatingOutfitId,
    wardrobeState.outfitDetails,
    wardrobeState.outfitDetailsLoading
  ]);

  const itemsValue = useMemo(() => ({
    items: itemsState.items,
    itemsLoading: itemsState.itemsLoading,
    itemsMessage: itemsState.itemsMessage,
    loadItems: itemsState.loadItems,
    composeOutfitFromSelected: itemsState.composeOutfitFromSelected,
    composeOutfitLoading: itemsState.composeOutfitLoading,
    selectedItemIds: itemsState.selectedItemIds,
    toggleSelectItem: itemsState.toggleSelectItem,
    selectedItems: itemsState.selectedItems,
    resetItemsState: itemsState.resetItemsState
  }), [
    itemsState.items,
    itemsState.itemsLoading,
    itemsState.itemsMessage,
    itemsState.composeOutfitLoading,
    itemsState.selectedItemIds,
    itemsState.selectedItems,
    itemsState.resetItemsState
  ]);

  const settingsValue = useMemo(() => ({
    profileName: settingsState.profileName,
    setProfileName: settingsState.setProfileName,
    newEmail: settingsState.newEmail,
    setNewEmail: settingsState.setNewEmail,
    newPassword: settingsState.newPassword,
    setNewPassword: settingsState.setNewPassword,
    saveProfile: settingsState.saveProfile,
    saveEmail: settingsState.saveEmail,
    savePassword: settingsState.savePassword,
    settingsForm: settingsState.settingsForm,
    setSettingsForm: settingsState.setSettingsForm,
    profilePhotoUrl: settingsState.profilePhotoUrl,
    profilePhotoUploading: settingsState.profilePhotoUploading,
    saveModelSettings: settingsState.saveModelSettings,
    costSummary: settingsState.costSummary,
    costSummaryLoading: settingsState.costSummaryLoading,
    loadCosts: settingsState.loadCosts,
    uploadProfilePhoto: settingsState.uploadProfilePhoto,
    modelOptions: analysisState.modelOptions
  }), [
    settingsState.profileName,
    settingsState.newEmail,
    settingsState.newPassword,
    settingsState.settingsForm,
    settingsState.profilePhotoUrl,
    settingsState.profilePhotoUploading,
    settingsState.costSummary,
    settingsState.costSummaryLoading,
    settingsState.loadCosts,
    settingsState.uploadProfilePhoto,
    analysisState.modelOptions
  ]);

  const historyValue = useMemo(() => ({
    history: historyState.history,
    historyLoading: historyState.historyLoading,
    historyMessage: historyState.historyMessage,
    loadHistory: historyState.loadHistory
  }), [
    historyState.history,
    historyState.historyLoading,
    historyState.historyMessage
  ]);

  const userFullName = (auth.session?.user?.user_metadata?.full_name || "").trim();
  const userEmail = auth.session?.user?.email || "";
  const userLabel = userFullName || userEmail || "your account";

  return (
    <DashboardProviders
      authValue={authValue}
      analysisValue={analysisValue}
      wardrobeValue={wardrobeValue}
      itemsValue={itemsValue}
      historyValue={historyValue}
      settingsValue={settingsValue}
    >
      {!auth.session ? (
        <LandingAuth />
      ) : (
        <main className="dashboard">
          <header className="dashboard-header">
            <div>
              <button
                type="button"
                className="eyebrow outfitme-home-btn"
                onClick={() => setDashboardTab("dashboard")}
              >
                OutfitMe
              </button>
              <h1>{userFullName ? `Welcome back, ${userFullName}` : "Welcome back"}</h1>
              <p className="subtext">
                {userFullName
                  ? "Great to see you again. Ready to analyze your next outfit?"
                  : `Signed in as ${userLabel}`}
              </p>
            </div>
            <div className="dashboard-user-actions" ref={accountMenuRef}>
              <button
                type="button"
                className="hero-badge-button"
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={accountMenuOpen}
                onClick={() => setAccountMenuOpen((current) => !current)}
              >
                <div className="hero-badge" aria-label={settingsState.profilePhotoUrl ? "Profile photo uploaded" : "Default profile badge"}>
                  {settingsState.profilePhotoUrl ? (
                    <img src={settingsState.profilePhotoUrl} alt="Profile badge" className="hero-badge-image" />
                  ) : (
                    <span className="hero-badge-fallback" aria-hidden="true">
                      <User size={22} />
                    </span>
                  )}
                </div>
              </button>
              {accountMenuOpen ? (
                <div className="account-menu" role="menu" aria-label="Account actions">
                  <button
                    type="button"
                    role="menuitem"
                    className="account-menu-item"
                    onClick={() => {
                      setDashboardTab("settings");
                      setAccountMenuOpen(false);
                    }}
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="account-menu-item danger"
                    onClick={handleSignOut}
                  >
                    Sign out
                  </button>
                </div>
              ) : null}
            </div>
          </header>

          <section className="card">
            <Tabs.Root value={dashboardTab} onValueChange={(nextValue) => setDashboardTab(nextValue)}>
              <Tabs.List className="tab-row">
                <Tabs.Tab className="tab-btn" value="dashboard">Home</Tabs.Tab>
                <Tabs.Tab className="tab-btn" value="analyze">Photo analysis</Tabs.Tab>
                <Tabs.Tab className="tab-btn" value="wardrobe">My Outfits</Tabs.Tab>
                <Tabs.Tab className="tab-btn" value="items">Item catalog</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="dashboard">
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
              </Tabs.Panel>
              <Tabs.Panel value="analyze">
                <AnalyzeTab />
              </Tabs.Panel>
              <Tabs.Panel value="wardrobe">
                <OutfitsTab />
              </Tabs.Panel>
              <Tabs.Panel value="items">
                <ItemsTab />
              </Tabs.Panel>
              <Tabs.Panel value="settings">
                <SettingsTab />
              </Tabs.Panel>
            </Tabs.Root>
          </section>
        </main>
      )}
    </DashboardProviders>
  );
}
