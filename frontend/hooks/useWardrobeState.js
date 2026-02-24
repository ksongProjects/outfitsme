import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useWardrobeState({ accessToken, onWardrobeChanged }) {
  const [wardrobeMessage, setWardrobeMessage] = useState("");
  const [deletingOutfitId, setDeletingOutfitId] = useState("");
  const [updatingOutfitId, setUpdatingOutfitId] = useState("");
  const [outfitDetails, setOutfitDetails] = useState(null);
  const [outfitDetailsLoading, setOutfitDetailsLoading] = useState(false);
  const queryClient = useQueryClient();

  const wardrobeQuery = useQuery({
    queryKey: ["wardrobe", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return [];
      }

      const wardrobeRes = await fetch(`${API_BASE}/api/wardrobe`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!wardrobeRes.ok) {
        const errorBody = await wardrobeRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load wardrobe right now.");
      }

      const wardrobeJson = await wardrobeRes.json();
      return wardrobeJson.wardrobe || [];
    },
    enabled: false,
    staleTime: 20_000
  });

  const wardrobe = wardrobeQuery.data || [];
  const wardrobeLoading = wardrobeQuery.isFetching;

  const loadWardrobe = async () => {
    if (!accessToken) {
      return;
    }
    setWardrobeMessage("");

    const result = await wardrobeQuery.refetch();
    if (result.isError) {
      setWardrobeMessage("Couldn't load your wardrobe right now. You can still analyze a new outfit.");
      toast.error("Couldn't load outfits right now.");
      return;
    }

    const entries = result.data || [];
    setWardrobeMessage(entries.length === 0 ? "No wardrobe entries yet. Analyze your first outfit photo." : "");
  };

  const deleteWardrobeEntry = async (outfitId) => {
    if (!accessToken) {
      return false;
    }

    setWardrobeMessage("");
    setDeletingOutfitId(outfitId);

    try {
      await deleteWardrobeMutation.mutateAsync(outfitId);
      const cachedWardrobe = queryClient.getQueryData(["wardrobe", accessToken]);
      const currentEntries = Array.isArray(cachedWardrobe) ? cachedWardrobe : [];
      if (currentEntries.length === 0) {
        setWardrobeMessage("No wardrobe entries yet. Analyze your first outfit photo.");
      } else {
        setWardrobeMessage("Outfit removed.");
      }
      toast.success("Outfit deleted.");
      if (onWardrobeChanged) {
        onWardrobeChanged();
      }
      return true;
    } catch (_err) {
      setWardrobeMessage("Could not delete this outfit right now. Please try again.");
      toast.error("Could not delete outfit right now.");
      return false;
    } finally {
      setDeletingOutfitId("");
    }
  };

  const deleteWardrobeMutation = useMutation({
    mutationFn: async (outfitId) => {
      const response = await fetch(`${API_BASE}/api/wardrobe/${outfitId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete wardrobe item.");
      }
      return await response.json();
    },
    onSuccess: async (_data, deletedOutfitId) => {
      queryClient.setQueryData(["wardrobe", accessToken], (current) => {
        const entries = Array.isArray(current) ? current : [];
        const nextEntries = entries.filter((entry) => entry.outfit_id !== deletedOutfitId);
        if (nextEntries.length === 0) {
          setWardrobeMessage("No wardrobe entries yet. Analyze your first outfit photo.");
        }
        return nextEntries;
      });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

  const renameOutfitMutation = useMutation({
    mutationFn: async ({ outfitId, styleLabel }) => {
      const response = await fetch(`${API_BASE}/api/wardrobe/${outfitId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ style_label: styleLabel })
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to update outfit name.");
      }
      const payload = await response.json();
      return payload.outfit;
    },
    onSuccess: async (updatedOutfit) => {
      queryClient.setQueryData(["wardrobe", accessToken], (current) => {
        const entries = Array.isArray(current) ? current : [];
        return entries.map((entry) => (
          entry.outfit_id === updatedOutfit.outfit_id
            ? { ...entry, style_label: updatedOutfit.style_label }
            : entry
        ));
      });

      setOutfitDetails((current) => {
        if (!current || !current.selected_outfit) {
          return current;
        }
        const selectedOutfit = current.selected_outfit;
        if (selectedOutfit.outfit_id !== updatedOutfit.outfit_id) {
          return current;
        }
        return {
          ...current,
          outfits: (current.outfits || []).map((outfit) => (
            outfit.outfit_id === updatedOutfit.outfit_id
              ? { ...outfit, style: updatedOutfit.style_label }
              : outfit
          )),
          selected_outfit: {
            ...selectedOutfit,
            style: updatedOutfit.style_label
          }
        };
      });

      toast.success("Outfit name updated.");
      if (onWardrobeChanged) {
        onWardrobeChanged();
      }
    }
  });

  const renameOutfit = async (outfitId, styleLabel) => {
    if (!accessToken) {
      return false;
    }
    setUpdatingOutfitId(outfitId);
    try {
      await renameOutfitMutation.mutateAsync({ outfitId, styleLabel });
      return true;
    } catch (err) {
      setWardrobeMessage("Could not update outfit name right now.");
      toast.error(err.message || "Could not update outfit name right now.");
      return false;
    } finally {
      setUpdatingOutfitId("");
    }
  };

  const openOutfitDetails = async (photoId, outfitIndex = null) => {
    if (!accessToken) {
      return;
    }

    setOutfitDetailsLoading(true);
    setWardrobeMessage("");

    try {
      const query = outfitIndex === null || outfitIndex === undefined ? "" : `?outfit_index=${outfitIndex}`;
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/details${query}`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to load outfit details.");
      }

      const payload = await response.json();
      setOutfitDetails(payload.details || null);
    } catch (_err) {
      setOutfitDetails(null);
      setWardrobeMessage("Could not load outfit details right now.");
      toast.error("Could not load outfit details.");
    } finally {
      setOutfitDetailsLoading(false);
    }
  };

  const closeOutfitDetails = () => setOutfitDetails(null);

  const resetWardrobeState = () => {
    setWardrobeMessage("");
    setDeletingOutfitId("");
    setUpdatingOutfitId("");
    setOutfitDetails(null);
    setOutfitDetailsLoading(false);
    queryClient.removeQueries({ queryKey: ["wardrobe", accessToken] });
  };

  return {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading,
    resetWardrobeState
  };
}
