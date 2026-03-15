"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { ItemRecord } from "@/lib/types";

export function useItemsState({ accessToken }: { accessToken: string }) {
  const CACHE_STALE_MS = 5 * 60 * 1000;
  const queryClient = useQueryClient();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);

  const fetchItems = async () => {
    if (!accessToken) {
      return [] as ItemRecord[];
    }

    const itemsRes = await fetch(`${API_BASE}/api/items`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!itemsRes.ok) {
      const errorBody = await itemsRes.json().catch(() => ({}));
      throw new Error(errorBody.error || "Unable to load items right now.");
    }

    const itemsJson = await itemsRes.json();
    return (itemsJson.items || []) as ItemRecord[];
  };

  const itemsQuery = useQuery({
    queryKey: ["items", accessToken],
    queryFn: fetchItems,
    enabled: Boolean(accessToken),
    staleTime: 20_000,
  });

  const items = itemsQuery.data || [];
  const itemsLoading = itemsQuery.isFetching;
  const itemsMessage = itemsQuery.isError
    ? "Couldn't load item catalog right now."
    : items.length === 0
      ? "No items yet. Analyze an outfit to populate your item catalog."
      : "";

  const loadItems = async () => {
    if (!accessToken) {
      return;
    }

    const queryKey = ["items", accessToken];
    const cachedItems = queryClient.getQueryData(queryKey);
    const queryState = queryClient.getQueryState(queryKey);

    if (
      Array.isArray(cachedItems) &&
      typeof queryState?.dataUpdatedAt === "number" &&
      !queryState?.isInvalidated &&
      Date.now() - queryState.dataUpdatedAt < CACHE_STALE_MS
    ) {
      return;
    }

    const result = await itemsQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load item catalog.");
    }
  };

  const composeOutfitMutation = useMutation({
    mutationFn: async ({ itemIds, styleLabel }: { itemIds: string[]; styleLabel: string }) => {
      const response = await fetch(`${API_BASE}/api/outfits/compose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          item_ids: itemIds,
          style_label: styleLabel || "Composed outfit",
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to compose outfit.");
      }

      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["items", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    },
  });

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(item.id)),
    [items, selectedItemIds]
  );

  const composeOutfitFromSelected = async () => {
    if (!accessToken) {
      throw new Error("Please sign in first.");
    }
    if (selectedItemIds.length === 0) {
      throw new Error("Select at least one item.");
    }

    const styleCounts: Record<string, number> = {};
    for (const item of selectedItems) {
      const style = (item.style_label || "").trim();
      if (!style) continue;
      styleCounts[style] = (styleCounts[style] || 0) + 1;
    }

    const topStyle =
      Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Composed outfit";

    const result = await composeOutfitMutation.mutateAsync({
      itemIds: selectedItemIds,
      styleLabel: topStyle,
    });

    setSelectedItemIds([]);
    toast.success("New outfit created from selected items.");
    return result;
  };

  return {
    items,
    itemsLoading,
    itemsMessage,
    loadItems,
    composeOutfitFromSelected,
    composeOutfitLoading: composeOutfitMutation.isPending,
    selectedItemIds,
    toggleSelectItem: (itemId: string) => {
      setSelectedItemIds((prev) =>
        prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
      );
    },
    selectedItems,
    resetItemsState: () => setSelectedItemIds([]),
  };
}
