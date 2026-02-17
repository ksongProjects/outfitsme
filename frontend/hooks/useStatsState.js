import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "../lib/apiBase";

const emptyStats = {
  photos_count: 0,
  outfits_count: 0,
  analyses_count: 0,
  items_count: 0,
  top_item_types: [],
  detailed_item_types: [],
  top_colors: [],
  latest_outfit: null,
  highlights: {
    most_common_item_type: "N/A",
    most_common_color: "N/A",
    avg_items_per_outfit: 0
  }
};

export function useStatsState({ accessToken }) {
  const statsQuery = useQuery({
    queryKey: ["stats", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return emptyStats;
      }

      const response = await fetch(`${API_BASE}/api/stats`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        throw new Error("Unable to load stats.");
      }

      const payload = await response.json();
      return payload.stats || emptyStats;
    },
    enabled: Boolean(accessToken),
    staleTime: 20_000
  });

  const loadStats = async () => {
    await statsQuery.refetch();
  };

  return {
    stats: statsQuery.data || emptyStats,
    statsLoading: statsQuery.isFetching,
    loadStats
  };
}
