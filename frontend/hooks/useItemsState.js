import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useItemsState({ accessToken }) {
  const queryClient = useQueryClient();
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  const fetchItems = async () => {
    if (!accessToken) {
      return [];
    }

    const itemsRes = await fetch(`${API_BASE}/api/items`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!itemsRes.ok) {
      const errorBody = await itemsRes.json().catch(() => ({}));
      throw new Error(errorBody.error || "Unable to load items right now.");
    }

    const itemsJson = await itemsRes.json();
    return itemsJson.items || [];
  };

  const itemsQuery = useQuery({
    queryKey: ["items", accessToken],
    queryFn: fetchItems,
    enabled: Boolean(accessToken),
    staleTime: 20_000
  });

  const items = itemsQuery.data || [];
  const itemsLoading = itemsQuery.isFetching;
  const itemsMessage = itemsQuery.isError
    ? "Couldn't load item catalog right now."
    : (items.length === 0 ? "No items yet. Analyze an outfit to populate your item catalog." : "");

  const loadItems = async () => {
    const result = await itemsQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load item catalog.");
      return;
    }
    if ((result.data || []).length === 0) {
      toast.info("No items yet.");
    }
  };

  const composeOutfitMutation = useMutation({
    mutationFn: async ({ itemIds, styleLabel }) => {
      const response = await fetch(`${API_BASE}/api/outfits/compose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          item_ids: itemIds,
          style_label: styleLabel || "Composed outfit"
        })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to compose outfit.");
      }
      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

  const composeOutfitFromSelected = async () => {
    if (!accessToken) {
      throw new Error("Please sign in first.");
    }
    if (selectedItemIds.length === 0) {
      throw new Error("Select at least one item.");
    }

    const styleCounts = {};
    for (const item of selectedItems) {
      const style = (item.style_label || "").trim();
      if (!style) {
        continue;
      }
      styleCounts[style] = (styleCounts[style] || 0) + 1;
    }
    const topStyle = Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Composed outfit";

    const result = await composeOutfitMutation.mutateAsync({
      itemIds: selectedItemIds,
      styleLabel: topStyle
    });
    setSelectedItemIds([]);
    toast.success("New outfit created from selected items.");
    return result;
  };

  const toggleSelectItem = (itemId) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(itemId)) {
        return prev.filter((id) => id !== itemId);
      }
      return [...prev, itemId];
    });
  };

  const resetItemsState = () => {
    setSelectedItemIds([]);
  };

  const selectedItems = items.filter((item) => selectedItemIds.includes(item.id));

  return {
    items,
    itemsLoading,
    itemsMessage,
    loadItems,
    composeOutfitFromSelected,
    composeOutfitLoading: composeOutfitMutation.isPending,
    selectedItemIds,
    toggleSelectItem,
    selectedItems,
    resetItemsState
  };
}
