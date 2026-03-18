"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { ItemRecord } from "@/lib/types";

const EMPTY_ITEMS: ItemRecord[] = [];
const ITEMS_STALE_MS = 60 * 1000;

const normalizeLabel = (value: unknown, fallback: string) => {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return fallback;
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
};

const getItemStyleLabel = (item: ItemRecord) =>
  normalizeLabel(
    typeof item.attributes_json?.outfit_style === "string"
      ? item.attributes_json.outfit_style
      : item.style_label,
    "Unknown"
  );

const normalizeItemRecord = (item: ItemRecord): ItemRecord => ({
  ...item,
  category: normalizeLabel(item.category, "Item"),
  name: normalizeLabel(item.name, "Unknown Item"),
  color: normalizeLabel(item.color, "Unknown"),
  style_label: getItemStyleLabel(item),
});

export function useItemsState({ accessToken, initialPageSize = 20 }: { accessToken: string; initialPageSize?: number }) {
  const queryClient = useQueryClient();
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  type ItemsPagePayload = { items: ItemRecord[]; has_more: boolean };

  const fetchItemsPage = async (page: number, size: number) => {
    const itemsRes = await fetch(`${API_BASE}/api/items?page=${page}&page_size=${size}`, {
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
    return {
      items: ((itemsJson.items || []) as ItemRecord[]).map(normalizeItemRecord),
      has_more: Boolean(itemsJson.has_more),
    } satisfies ItemsPagePayload;
  };

  const itemsQuery = useQuery({
    queryKey: ["items", accessToken, currentPage, pageSize],
    queryFn: () => fetchItemsPage(currentPage, pageSize),
    enabled: Boolean(accessToken),
    staleTime: ITEMS_STALE_MS,
    placeholderData: (previousData) => previousData,
  });

  const items = itemsQuery.data?.items ?? EMPTY_ITEMS;
  const itemsHasMore = Boolean(itemsQuery.data?.has_more);
  const itemsLoading = itemsQuery.isLoading || itemsQuery.isFetching;
  const itemsMessage = itemsQuery.isError
    ? "Couldn't load item catalog right now."
    : items.length === 0
      ? "No items yet. Analyze an outfit to populate your item catalog."
      : "";

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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["items", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["stats", accessToken] }),
      ]);
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
      if (!style) {
        continue;
      }
      styleCounts[style] = (styleCounts[style] || 0) + 1;
    }

    const topStyle =
      Object.entries(styleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "Composed outfit";

    const result = await composeOutfitMutation.mutateAsync({
      itemIds: selectedItemIds,
      styleLabel: topStyle,
    });

    setSelectedItemIds([]);
    toast.success("New outfit created with a generated preview.");
    return result;
  };

  const refreshItems = async () => {
    if (!accessToken) {
      return;
    }

    const result = await itemsQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load item catalog.");
    }
  };

  return {
    items,
    itemsLoading,
    itemsMessage,
    refreshItems,
    composeOutfitFromSelected,
    composeOutfitLoading: composeOutfitMutation.isPending,
    selectedItemIds,
    toggleSelectItem: (itemId: string) => {
      setSelectedItemIds((prev) =>
        prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
      );
    },
    selectedItems,
    itemsPage: currentPage,
    itemsPageSize: pageSize,
    itemsHasMore,
    nextItemsPage: () => {
      setSelectedItemIds([]);
      setCurrentPage((page) => page + 1);
    },
    prevItemsPage: () => {
      setSelectedItemIds([]);
      setCurrentPage((page) => Math.max(1, page - 1));
    },
    setItemsPage: (page: number) => {
      setSelectedItemIds([]);
      setCurrentPage(page);
    },
    setItemsPageSize: (size: number) => {
      setSelectedItemIds([]);
      setPageSize(size);
      setCurrentPage(1); // Reset to first page when changing page size
    },
    resetItemsState: () => {
      setSelectedItemIds([]);
      setCurrentPage(1);
      setPageSize(initialPageSize);
    },
  };
}
