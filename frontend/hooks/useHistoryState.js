import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useHistoryState({ accessToken }) {
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

  const loadHistory = async () => {
    const result = await historyQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load history.");
      return;
    }
    if ((result.data || []).length === 0) {
      toast.info("No history yet.");
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
