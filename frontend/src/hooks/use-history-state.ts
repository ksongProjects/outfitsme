"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { HistoryEntry } from "@/lib/types";

const HISTORY_STALE_MS = 60 * 1000;

export function useHistoryState({ accessToken, initialPageSize = 20 }: { accessToken: string; initialPageSize?: number }) {
  const queryClient = useQueryClient();
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

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

  const allHistory = historyQuery.data || [];
  const totalItems = allHistory.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const history = allHistory.slice(startIndex, endIndex);
  const historyHasMore = currentPage < totalPages;
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
    historyPage: currentPage,
    historyPageSize: pageSize,
    historyTotalItems: totalItems,
    historyTotalPages: totalPages,
    historyHasMore,
    nextHistoryPage: () => {
      setCurrentPage((page) => Math.min(totalPages, page + 1));
    },
    prevHistoryPage: () => {
      setCurrentPage((page) => Math.max(1, page - 1));
    },
    setHistoryPage: (page: number) => {
      setCurrentPage(Math.max(1, Math.min(totalPages, page)));
    },
    setHistoryPageSize: (size: number) => {
      setPageSize(size);
      setCurrentPage(1); // Reset to first page when changing page size
    },
    resetHistoryState: () => {
      setCurrentPage(1);
      setPageSize(initialPageSize);
      queryClient.removeQueries({ queryKey: ["history", accessToken] });
    },
  };
}
