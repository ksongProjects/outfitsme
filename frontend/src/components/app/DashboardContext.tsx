"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { useAnalysisState } from "@/hooks/use-analysis-state";
import type { useAuthState } from "@/hooks/use-auth-state";
import type { useHistoryState } from "@/hooks/use-history-state";
import type { useItemsState } from "@/hooks/use-items-state";
import type { useSettingsState } from "@/hooks/use-settings-state";
import type { useWardrobeState } from "@/hooks/use-wardrobe-state";

type AuthContextValue = ReturnType<typeof useAuthState> & {
  signOut: () => Promise<void>;
};
type AnalysisContextValue = ReturnType<typeof useAnalysisState>;
type WardrobeContextValue = ReturnType<typeof useWardrobeState>;
type ItemsContextValue = ReturnType<typeof useItemsState>;
type HistoryContextValue = ReturnType<typeof useHistoryState>;
type SettingsContextValue = ReturnType<typeof useSettingsState>;

type DashboardStoreState = {
  auth: AuthContextValue;
  analysis: AnalysisContextValue;
  wardrobe: WardrobeContextValue;
  items: ItemsContextValue;
  history: HistoryContextValue;
  settings: SettingsContextValue;
};

type DashboardStore = StoreApi<DashboardStoreState>;

type ProvidersProps = {
  authValue: AuthContextValue;
  analysisValue: AnalysisContextValue;
  wardrobeValue: WardrobeContextValue;
  itemsValue: ItemsContextValue;
  historyValue: HistoryContextValue;
  settingsValue: SettingsContextValue;
  children: React.ReactNode;
};

const DashboardStoreContext = createContext<DashboardStore | null>(null);

function createDashboardStore(initialState: DashboardStoreState) {
  return createStore<DashboardStoreState>()(() => initialState);
}

export function DashboardProviders({
  authValue,
  analysisValue,
  wardrobeValue,
  itemsValue,
  historyValue,
  settingsValue,
  children,
}: ProvidersProps) {
  const [store] = useState<DashboardStore>(() =>
    createDashboardStore({
      auth: authValue,
      analysis: analysisValue,
      wardrobe: wardrobeValue,
      items: itemsValue,
      history: historyValue,
      settings: settingsValue,
    })
  );

  useEffect(() => {
    store.setState({
      auth: authValue,
      analysis: analysisValue,
      wardrobe: wardrobeValue,
      items: itemsValue,
      history: historyValue,
      settings: settingsValue,
    });
  }, [store, authValue, analysisValue, wardrobeValue, itemsValue, historyValue, settingsValue]);

  return <DashboardStoreContext.Provider value={store}>{children}</DashboardStoreContext.Provider>;
}

function useDashboardSelector<T>(selector: (state: DashboardStoreState) => T, name: string) {
  const store = useContext(DashboardStoreContext);
  if (!store) {
    throw new Error(`${name} must be used within DashboardProviders.`);
  }
  return useStore(store, selector);
}

export function useAuthContext() {
  return useDashboardSelector((state) => state.auth, "useAuthContext");
}

export function useAnalysisContext() {
  return useDashboardSelector((state) => state.analysis, "useAnalysisContext");
}

export function useWardrobeContext() {
  return useDashboardSelector((state) => state.wardrobe, "useWardrobeContext");
}

export function useItemsContext() {
  return useDashboardSelector((state) => state.items, "useItemsContext");
}

export function useHistoryContext() {
  return useDashboardSelector((state) => state.history, "useHistoryContext");
}

export function useSettingsContext() {
  return useDashboardSelector((state) => state.settings, "useSettingsContext");
}
