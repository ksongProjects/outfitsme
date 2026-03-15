"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { OutfitAnalysis, WardrobeDetails, WardrobeEntry } from "@/lib/types";

export function useWardrobeState({
  accessToken,
  onWardrobeChanged,
}: {
  accessToken: string;
  onWardrobeChanged?: () => void;
}) {
  const CACHE_STALE_MS = 5 * 60 * 1000;
  const DETAILS_CACHE_STALE_MS = 5 * 60 * 1000;
  const [wardrobeMessage, setWardrobeMessage] = useState("");
  const [deletingOutfitId, setDeletingOutfitId] = useState("");
  const [updatingOutfitId, setUpdatingOutfitId] = useState("");
  const [outfitMeLoading, setOutfitsMeLoading] = useState(false);
  const [outfitDetails, setOutfitDetails] = useState<WardrobeDetails | null>(null);
  const [outfitDetailsLoading, setOutfitDetailsLoading] = useState(false);
  const queryClient = useQueryClient();

  const buildDetailsQueryKey = (photoId: string) => ["wardrobeDetails", accessToken, photoId];

  const selectOutfitFromDetails = (
    details: WardrobeDetails | null,
    outfitIndex: number | null = null
  ): WardrobeDetails | null => {
    if (!details) {
      return null;
    }

    if (outfitIndex === null || outfitIndex === undefined) {
      return {
        ...details,
        selected_outfit_index: outfitIndex,
        selected_outfit: null,
      };
    }

    const outfits = Array.isArray(details.outfits) ? details.outfits : [];
    const selectedOutfit =
      outfits.find((outfit) => outfit?.outfit_index === outfitIndex) || null;

    return {
      ...details,
      selected_outfit_index: outfitIndex,
      selected_outfit: selectedOutfit,
    };
  };

  const fetchOutfitDetailsByPhoto = async (photoId: string) => {
    const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/details`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      throw new Error(errorBody.error || "Failed to load outfit details.");
    }

    const payload = await response.json();
    return (payload.details || null) as WardrobeDetails | null;
  };

  const wardrobeQuery = useQuery({
    queryKey: ["wardrobe", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return [] as WardrobeEntry[];
      }

      const wardrobeRes = await fetch(`${API_BASE}/api/wardrobe`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!wardrobeRes.ok) {
        const errorBody = await wardrobeRes.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load wardrobe right now.");
      }

      const wardrobeJson = await wardrobeRes.json();
      return (wardrobeJson.wardrobe || []) as WardrobeEntry[];
    },
    enabled: false,
    staleTime: 20_000,
  });

  const wardrobe = wardrobeQuery.data || [];
  const wardrobeLoading = wardrobeQuery.isFetching;

  const loadWardrobe = async (force = false) => {
    if (!accessToken) {
      return;
    }
    setWardrobeMessage("");

    if (!force) {
      const queryKey = ["wardrobe", accessToken];
      const cachedWardrobe = queryClient.getQueryData(queryKey);
      const queryState = queryClient.getQueryState(queryKey);
      if (
        Array.isArray(cachedWardrobe) &&
        typeof queryState?.dataUpdatedAt === "number" &&
        !queryState?.isInvalidated &&
        Date.now() - queryState.dataUpdatedAt < CACHE_STALE_MS
      ) {
        setWardrobeMessage(
          cachedWardrobe.length === 0
            ? "No wardrobe entries yet. Analyze your first outfit photo."
            : ""
        );
        return;
      }
    }

    const result = await wardrobeQuery.refetch();
    if (result.isError) {
      setWardrobeMessage("Couldn't load your wardrobe right now. You can still analyze a new outfit.");
      toast.error("Couldn't load outfits right now.");
      return;
    }

    const entries = result.data || [];
    setWardrobeMessage(
      entries.length === 0 ? "No wardrobe entries yet. Analyze your first outfit photo." : ""
    );
  };

  const deleteWardrobeMutation = useMutation({
    mutationFn: async (outfitId: string) => {
      const response = await fetch(`${API_BASE}/api/wardrobe/${outfitId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete wardrobe item.");
      }

      return response.json();
    },
    onSuccess: async (_data, deletedOutfitId) => {
      queryClient.setQueryData(["wardrobe", accessToken], (current: WardrobeEntry[] | undefined) => {
        const entries = Array.isArray(current) ? current : [];
        const nextEntries = entries.filter((entry) => entry.outfit_id !== deletedOutfitId);
        if (nextEntries.length === 0) {
          setWardrobeMessage("No wardrobe entries yet. Analyze your first outfit photo.");
        }
        return nextEntries;
      });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    },
  });

  const deleteWardrobeEntry = async (outfitId: string) => {
    if (!accessToken) return false;

    setWardrobeMessage("");
    setDeletingOutfitId(outfitId);
    try {
      await deleteWardrobeMutation.mutateAsync(outfitId);
      toast.success("Outfit deleted.");
      onWardrobeChanged?.();
      return true;
    } catch {
      setWardrobeMessage("Could not delete this outfit right now. Please try again.");
      toast.error("Could not delete outfit right now.");
      return false;
    } finally {
      setDeletingOutfitId("");
    }
  };

  const renameOutfitMutation = useMutation({
    mutationFn: async ({ outfitId, styleLabel }: { outfitId: string; styleLabel: string }) => {
      const response = await fetch(`${API_BASE}/api/wardrobe/${outfitId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ style_label: styleLabel }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to update outfit name.");
      }

      const payload = await response.json();
      return payload.outfit as WardrobeEntry;
    },
    onSuccess: async (updatedOutfit) => {
      queryClient.setQueryData(["wardrobe", accessToken], (current: WardrobeEntry[] | undefined) => {
        const entries = Array.isArray(current) ? current : [];
        return entries.map((entry) =>
          entry.outfit_id === updatedOutfit.outfit_id
            ? { ...entry, style_label: updatedOutfit.style_label }
            : entry
        );
      });

      setOutfitDetails((current) => {
        if (!current || !current.selected_outfit) return current;
        const selectedOutfit = current.selected_outfit;
        if (selectedOutfit.outfit_id !== updatedOutfit.outfit_id) return current;
        return {
          ...current,
          outfits: (current.outfits || []).map((outfit) =>
            outfit.outfit_id === updatedOutfit.outfit_id
              ? { ...outfit, style: updatedOutfit.style_label }
              : outfit
          ),
          selected_outfit: {
            ...selectedOutfit,
            style: updatedOutfit.style_label,
          } as OutfitAnalysis,
        };
      });

      toast.success("Outfit name updated.");
      onWardrobeChanged?.();
    },
  });

  const renameOutfit = async (outfitId: string, styleLabel: string) => {
    if (!accessToken) return false;
    setUpdatingOutfitId(outfitId);
    try {
      await renameOutfitMutation.mutateAsync({ outfitId, styleLabel });
      return true;
    } catch (error) {
      setWardrobeMessage("Could not update outfit name right now.");
      toast.error((error as Error).message || "Could not update outfit name right now.");
      return false;
    } finally {
      setUpdatingOutfitId("");
    }
  };

  const openOutfitDetails = async (photoId: string, outfitIndex: number | null = null) => {
    if (!accessToken) return;

    setOutfitDetailsLoading(true);
    setWardrobeMessage("");

    try {
      const details = await queryClient.fetchQuery({
        queryKey: buildDetailsQueryKey(photoId),
        queryFn: () => fetchOutfitDetailsByPhoto(photoId),
        staleTime: DETAILS_CACHE_STALE_MS,
      });

      const selectedDetails = selectOutfitFromDetails(details, outfitIndex);
      if (
        outfitIndex !== null &&
        outfitIndex !== undefined &&
        !selectedDetails?.selected_outfit
      ) {
        throw new Error("Requested outfit index not found for this photo.");
      }
      setOutfitDetails(selectedDetails);
    } catch {
      setOutfitDetails(null);
      setWardrobeMessage("Could not load outfit details right now.");
      toast.error("Could not load outfit details.");
    } finally {
      setOutfitDetailsLoading(false);
    }
  };

  const generateOutfitsMe = async (photoId: string, outfitIndex: number | null = null) => {
    if (!accessToken || !photoId) return false;

    setOutfitsMeLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/outfitsme`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          outfit_index: outfitIndex,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to generate OutfitsMe preview.");
      }

      const payload = await response.json();
      const nextImageUrl = payload.outfitsme_image_url || "";
      setOutfitDetails((current) =>
        current
          ? {
              ...current,
              outfitsme_image_url: nextImageUrl,
            }
          : current
      );

      await wardrobeQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
      toast.success("OutfitsMe preview generated.");
      return payload;
    } catch (error) {
      toast.error((error as Error).message || "Failed to generate OutfitsMe preview.");
      return false;
    } finally {
      setOutfitsMeLoading(false);
    }
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
    generateOutfitsMe,
    outfitMeLoading,
    openOutfitDetails,
    closeOutfitDetails: () => setOutfitDetails(null),
    outfitDetails,
    outfitDetailsLoading,
    resetWardrobeState: () => {
      setWardrobeMessage("");
      setDeletingOutfitId("");
      setUpdatingOutfitId("");
      setOutfitsMeLoading(false);
      setOutfitDetails(null);
      setOutfitDetailsLoading(false);
      queryClient.removeQueries({ queryKey: ["wardrobe", accessToken] });
      queryClient.removeQueries({ queryKey: ["wardrobeDetails", accessToken] });
    },
  };
}
