import { useState } from "react";

import { API_BASE } from "../lib/apiBase";

export function useStatsState() {
  const emptyStats = {
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
  const [stats, setStats] = useState(emptyStats);
  const [statsLoading, setStatsLoading] = useState(false);

  const loadStats = async (accessToken) => {
    if (!accessToken) {
      return;
    }

    try {
      setStatsLoading(true);
      const response = await fetch(`${API_BASE}/api/stats`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        return;
      }

      const payload = await response.json();
      setStats(payload.stats || emptyStats);
    } catch (_err) {
      // Optional UX helper.
    } finally {
      setStatsLoading(false);
    }
  };

  return { stats, statsLoading, loadStats };
}
