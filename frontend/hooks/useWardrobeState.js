import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useWardrobeState({ accessToken, onWardrobeChanged }) {
  const [wardrobeMessage, setWardrobeMessage] = useState("");
  const [deletingPhotoId, setDeletingPhotoId] = useState("");
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
    if (entries.length === 0) {
      toast.info("No outfits yet. Analyze your first photo.");
    }
  };

  const deleteWardrobeEntry = async (photoId) => {
    if (!accessToken) {
      return false;
    }

    setWardrobeMessage("");
    setDeletingPhotoId(photoId);

    try {
      await deleteWardrobeMutation.mutateAsync(photoId);
      setWardrobeMessage("Outfit removed.");
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
      setDeletingPhotoId("");
    }
  };

  const deleteWardrobeMutation = useMutation({
    mutationFn: async (photoId) => {
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}`, {
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

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
    setDeletingPhotoId("");
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
    deletingPhotoId,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading,
    resetWardrobeState
  };
}
