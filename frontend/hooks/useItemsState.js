import { useState } from "react";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useItemsState({ accessToken }) {
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsMessage, setItemsMessage] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState([]);

  const loadItems = async () => {
    if (!accessToken) {
      return;
    }

    setItemsLoading(true);
    setItemsMessage("");

    try {
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
      const rows = itemsJson.items || [];
      setItems(rows);
      setItemsMessage(rows.length === 0 ? "No items yet. Analyze an outfit to populate your item catalog." : "");
      if (rows.length === 0) {
        toast.info("No items yet.");
      }
    } catch (_err) {
      setItems([]);
      setItemsMessage("Couldn't load item catalog right now.");
      toast.error("Couldn't load item catalog.");
    } finally {
      setItemsLoading(false);
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
    setItems([]);
    setItemsMessage("");
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
