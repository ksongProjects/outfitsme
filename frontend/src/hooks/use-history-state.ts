"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { HistoryEntry } from "@/lib/types";

const HISTORY_STALE_MS = 60 * 1000;

export function useHistoryState({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient();

  const historyQuery = useQuery({
    queryKey: ["history", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load analysis history.");
      }

      const payload = await response.json();
      return (payload.history || []) as HistoryEntry[];
    },
    enabled: Boolean(accessToken),
    staleTime: HISTORY_STALE_MS,
  });

  const history = historyQuery.data || [];
  const historyLoading = historyQuery.isLoading || historyQuery.isFetching;
  const historyMessage = historyQuery.isError
    ? "Couldn't load history right now."
    : history.length === 0
      ? "No analysis history yet. Analyze a photo to populate this table."
      : "";

  const refreshHistory = async () => {
    if (!accessToken) {
      return;
    }

    const result = await historyQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load history.");
    }
  };

  return {
    history,
    historyLoading,
    historyMessage,
    refreshHistory,
    resetHistoryState: () => {
      queryClient.removeQueries({ queryKey: ["history", accessToken] });
    },
  };
}
