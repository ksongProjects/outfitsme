import { useState } from "react";

import { API_BASE } from "../lib/apiBase";

export function useStatsState() {
  const [stats, setStats] = useState({ outfits_count: 0, analyses_count: 0, items_count: 0 });

  const loadStats = async (accessToken) => {
    if (!accessToken) {
      return;
    }

    try {
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
      setStats(payload.stats || { outfits_count: 0, analyses_count: 0, items_count: 0 });
    } catch (_err) {
      // Optional UX helper.
    }
  };

  return { stats, loadStats };
}
