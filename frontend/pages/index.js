import { useCallback, useEffect, useMemo, useState } from "react";

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
import { useSettingsState } from "../hooks/useSettingsState";

export default function HomePage() {
  const [dashboardTab, setDashboardTab] = useState("dashboard");

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
    settingsState.loadModelSettings();
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

  const handleSignOut = useCallback(async () => {
    await auth.signOut();
    analysisState.resetAnalysisState();
    wardrobeState.resetWardrobeState();
    itemsState.resetItemsState();
    setDashboardTab("dashboard");
  }, [auth.signOut, analysisState.resetAnalysisState, wardrobeState.resetWardrobeState, itemsState.resetItemsState]);

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
    runAnalysis: analysisState.runAnalysis,
    disabled: analysisState.disabled,
    loading: analysisState.loading,
    analysis: analysisState.analysis,
    similarResults: analysisState.similarResults,
    selectedModel: analysisState.selectedModel,
    setSelectedModel: analysisState.setSelectedModel,
    modelOptions: analysisState.modelOptions,
    error: analysisState.error,
    info: analysisState.info
  }), [
    analysisState.previewUrl,
    analysisState.fileName,
    analysisState.disabled,
    analysisState.loading,
    analysisState.analysis,
    analysisState.similarResults,
    analysisState.selectedModel,
    analysisState.modelOptions,
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
    openOutfitDetails: wardrobeState.openOutfitDetails,
    closeOutfitDetails: wardrobeState.closeOutfitDetails,
    outfitDetails: wardrobeState.outfitDetails,
    outfitDetailsLoading: wardrobeState.outfitDetailsLoading
  }), [
    wardrobeState.wardrobe,
    wardrobeState.wardrobeLoading,
    wardrobeState.wardrobeMessage,
    wardrobeState.deletingOutfitId,
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
    selectedItems: itemsState.selectedItems
  }), [
    itemsState.items,
    itemsState.itemsLoading,
    itemsState.itemsMessage,
    itemsState.composeOutfitLoading,
    itemsState.selectedItemIds,
    itemsState.selectedItems
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
    saveModelSettings: settingsState.saveModelSettings,
    modelOptions: analysisState.modelOptions
  }), [
    settingsState.profileName,
    settingsState.newEmail,
    settingsState.newPassword,
    settingsState.settingsForm,
    analysisState.modelOptions
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
      settingsValue={settingsValue}
    >
      {!auth.session ? (
        <LandingAuth />
      ) : (
        <main className="dashboard">
          <header className="dashboard-header">
            <div>
              <p className="eyebrow">OutfitMe</p>
              <h1>{userFullName ? `Welcome back, ${userFullName}` : "Welcome back"}</h1>
              <p className="subtext">
                {userFullName
                  ? "Great to see you again. Ready to analyze your next outfit?"
                  : `Signed in as ${userLabel}`}
              </p>
            </div>
            <button className="ghost-btn" onClick={handleSignOut}>Sign out</button>
          </header>

          <section className="card">
            <div className="tab-row">
              <button
                className={`tab-btn ${dashboardTab === "dashboard" ? "active" : ""}`}
                onClick={() => setDashboardTab("dashboard")}
              >
                Home
              </button>
              <button
                className={`tab-btn ${dashboardTab === "analyze" ? "active" : ""}`}
                onClick={() => setDashboardTab("analyze")}
              >
                Photo analysis
              </button>
              <button
                className={`tab-btn ${dashboardTab === "wardrobe" ? "active" : ""}`}
                onClick={() => setDashboardTab("wardrobe")}
              >
                My Outfits
              </button>
              <button
                className={`tab-btn ${dashboardTab === "items" ? "active" : ""}`}
                onClick={() => setDashboardTab("items")}
              >
                Item catalog
              </button>
              <button
                className={`tab-btn ${dashboardTab === "settings" ? "active" : ""}`}
                onClick={() => setDashboardTab("settings")}
              >
                Settings
              </button>
            </div>

            {dashboardTab === "dashboard" ? (
              <DashboardTab
                stats={statsState.stats}
                refreshStats={() => statsState.loadStats()}
                loading={statsState.statsLoading}
              />
            ) : null}
            {dashboardTab === "analyze" ? <AnalyzeTab /> : null}
            {dashboardTab === "wardrobe" ? <OutfitsTab /> : null}
            {dashboardTab === "items" ? <ItemsTab /> : null}
            {dashboardTab === "settings" ? <SettingsTab /> : null}
          </section>
        </main>
      )}
    </DashboardProviders>
  );
}
