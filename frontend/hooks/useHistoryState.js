import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useHistoryState({ accessToken }) {
  const CACHE_STALE_MS = 5 * 60 * 1000;
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ["history", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return [];
      }
      const response = await fetch(`${API_BASE}/api/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load analysis history.");
      }
      const payload = await response.json();
      return payload.history || [];
    },
    enabled: false,
    staleTime: 20_000
  });

  const history = historyQuery.data || [];
  const historyLoading = historyQuery.isFetching;
  const historyMessage = historyQuery.isError
    ? "Couldn't load history right now."
    : (history.length === 0 ? "No analysis history yet. Analyze a photo to populate this table." : "");

  const loadHistory = async (force = false) => {
    if (!accessToken) {
      return;
    }
    if (!force) {
      const queryKey = ["history", accessToken];
      const cachedHistory = queryClient.getQueryData(queryKey);
      const queryState = queryClient.getQueryState(queryKey);
      if (
        Array.isArray(cachedHistory)
        && typeof queryState?.dataUpdatedAt === "number"
        && (Date.now() - queryState.dataUpdatedAt) < CACHE_STALE_MS
      ) {
        return;
      }
    }
    const result = await historyQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load history.");
    }
  };

  const resetHistoryState = () => {
    queryClient.removeQueries({ queryKey: ["history", accessToken] });
  };

  return {
    history,
    historyLoading,
    historyMessage,
    loadHistory,
    resetHistoryState
  };
}
