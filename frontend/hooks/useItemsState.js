import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useItemsState({ accessToken }) {
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
    selectedItemIds,
    toggleSelectItem,
    selectedItems,
    resetItemsState
  };
}
