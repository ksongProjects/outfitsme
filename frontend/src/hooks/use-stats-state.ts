"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "@/lib/api-base";
import type { StatsPayload } from "@/lib/types";

const emptyStats: StatsPayload = {
  photos_count: 0,
  outfits_count: 0,
  analyses_count: 0,
  items_count: 0,
  generated_outfit_images_count: 0,
  weekly_activity: {
    analyses_count: 0,
    outfits_count: 0,
    items_count: 0,
    window_start_utc: null,
  },
  top_item_types: [],
};

const STATS_STALE_MS = 20 * 1000;

export function useStatsState({ accessToken }: { accessToken: string }) {
  const statsQuery = useQuery({
    queryKey: ["stats", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/stats`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load stats.");
      }

      const payload = await response.json();
      return (payload.stats || emptyStats) as StatsPayload;
    },
    enabled: Boolean(accessToken),
    staleTime: STATS_STALE_MS,
  });

  return {
    stats: statsQuery.data || emptyStats,
    statsLoading: statsQuery.isLoading || statsQuery.isFetching,
    refreshStats: async () => {
      await statsQuery.refetch();
    },
  };
}
