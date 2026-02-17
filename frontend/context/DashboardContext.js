import { createContext, useContext } from "react";

const AuthContext = createContext(null);
const AnalysisContext = createContext(null);
const WardrobeContext = createContext(null);
const ItemsContext = createContext(null);
const SettingsContext = createContext(null);

export function DashboardProviders({
  authValue,
  analysisValue,
  wardrobeValue,
  itemsValue,
  settingsValue,
  children
}) {
  return (
    <AuthContext.Provider value={authValue}>
      <AnalysisContext.Provider value={analysisValue}>
        <WardrobeContext.Provider value={wardrobeValue}>
          <ItemsContext.Provider value={itemsValue}>
            <SettingsContext.Provider value={settingsValue}>
              {children}
            </SettingsContext.Provider>
          </ItemsContext.Provider>
        </WardrobeContext.Provider>
      </AnalysisContext.Provider>
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within DashboardProviders.");
  }
  return context;
}

export function useAnalysisContext() {
  const context = useContext(AnalysisContext);
  if (!context) {
    throw new Error("useAnalysisContext must be used within DashboardProviders.");
  }
  return context;
}

export function useWardrobeContext() {
  const context = useContext(WardrobeContext);
  if (!context) {
    throw new Error("useWardrobeContext must be used within DashboardProviders.");
  }
  return context;
}

export function useItemsContext() {
  const context = useContext(ItemsContext);
  if (!context) {
    throw new Error("useItemsContext must be used within DashboardProviders.");
  }
  return context;
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error("useSettingsContext must be used within DashboardProviders.");
  }
  return context;
}
