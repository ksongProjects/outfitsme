"use client";

import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "@/lib/api-base";
import type { StatsPayload } from "@/lib/types";

const emptyStats: StatsPayload = {
  photos_count: 0,
  outfits_count: 0,
  analyses_count: 0,
  items_count: 0,
  weekly_activity: {
    analyses_count: 0,
    outfits_count: 0,
    items_count: 0,
    window_start_utc: null,
  },
  top_item_types: [],
  detailed_item_types: [],
  clothing_item_types: [],
  accessory_item_types: [],
  top_colors: [],
  category_split: {
    clothing_items_count: 0,
    accessories_items_count: 0,
  },
  latest_outfit: null,
  highlights: {
    most_common_item_type: "N/A",
    most_common_color: "N/A",
    most_common_accessory_type: "N/A",
  },
};

export function useStatsState({ accessToken }: { accessToken: string }) {
  const statsQuery = useQuery({
    queryKey: ["stats", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return emptyStats;
      }

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
    staleTime: 20_000,
  });

  return {
    stats: statsQuery.data || emptyStats,
    statsLoading: statsQuery.isFetching,
    loadStats: async () => {
      await statsQuery.refetch();
    },
  };
}
