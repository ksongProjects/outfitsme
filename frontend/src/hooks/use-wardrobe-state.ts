"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import type { WardrobeDetails, WardrobeEntry } from "@/lib/types";

const WARDROBE_STALE_MS = 60 * 1000;
const DETAILS_CACHE_STALE_MS = 5 * 60 * 1000;

const normalizeLabel = (value: unknown, fallback: string) => {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) {
    return fallback;
  }
  return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
};

const normalizeWardrobeEntry = (entry: WardrobeEntry): WardrobeEntry => ({
  ...entry,
  row_id: entry.row_id || entry.outfit_id || `${entry.photo_id}:${entry.outfit_index ?? 0}`,
  style_label: normalizeLabel(entry.style_label, "Unlabeled"),
  source_type: String(entry.source_type || "photo_analysis"),
  outfit_index: typeof entry.outfit_index === "number" ? entry.outfit_index : 0,
});

export function useWardrobeState({
  accessToken,
  onWardrobeChanged,
}: {
  accessToken: string;
  onWardrobeChanged?: () => void;
}) {
  const PAGE_SIZE = 20;
  const [statusMessage, setStatusMessage] = useState("");
  const [deletingOutfitId, setDeletingOutfitId] = useState("");
  const [updatingOutfitId, setUpdatingOutfitId] = useState("");
  const [outfitMeLoading, setOutfitsMeLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedDetailsRequest, setSelectedDetailsRequest] = useState<{
    photoId: string;
    outfitIndex: number | null;
  } | null>(null);
  const queryClient = useQueryClient();

  type WardrobePagePayload = { wardrobe: WardrobeEntry[]; has_more: boolean };

  const buildDetailsQueryKey = (photoId: string, outfitIndex: number | null = null) =>
    ["wardrobeDetails", accessToken, photoId, outfitIndex ?? "all"] as const;

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

  const fetchOutfitDetailsByPhoto = async (photoId: string, outfitIndex: number | null = null) => {
    const query = typeof outfitIndex === "number" ? `?outfit_index=${outfitIndex}` : "";
    const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/details${query}`, {
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

  const fetchWardrobePage = async (page: number) => {
    const wardrobeRes = await fetch(`${API_BASE}/api/wardrobe?page=${page}&page_size=${PAGE_SIZE}`, {
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
    return {
      wardrobe: ((wardrobeJson.wardrobe || []) as WardrobeEntry[]).map(normalizeWardrobeEntry),
      has_more: Boolean(wardrobeJson.has_more),
    } satisfies WardrobePagePayload;
  };

  const wardrobeQuery = useQuery({
    queryKey: ["wardrobe", accessToken, currentPage],
    queryFn: () => fetchWardrobePage(currentPage),
    enabled: Boolean(accessToken),
    staleTime: WARDROBE_STALE_MS,
    placeholderData: (previousData) => previousData,
  });

  const detailsPhotoId = selectedDetailsRequest?.photoId || "";
  const detailsOutfitIndex = selectedDetailsRequest?.outfitIndex ?? null;
  const outfitDetailsQuery = useQuery({
    queryKey: buildDetailsQueryKey(detailsPhotoId, detailsOutfitIndex),
    queryFn: () => fetchOutfitDetailsByPhoto(detailsPhotoId, detailsOutfitIndex),
    enabled: Boolean(accessToken && detailsPhotoId),
    staleTime: DETAILS_CACHE_STALE_MS,
  });

  const wardrobe = wardrobeQuery.data?.wardrobe || [];
  const wardrobeHasMore = Boolean(wardrobeQuery.data?.has_more);
  const wardrobeLoading = wardrobeQuery.isLoading || wardrobeQuery.isFetching;
  const outfitDetails = useMemo(
    () =>
      selectOutfitFromDetails(
        outfitDetailsQuery.data || null,
        selectedDetailsRequest?.outfitIndex ?? null
      ),
    [outfitDetailsQuery.data, selectedDetailsRequest]
  );
  const outfitDetailsLoading =
    Boolean(selectedDetailsRequest) &&
    (outfitDetailsQuery.isLoading || outfitDetailsQuery.isFetching);
  const wardrobeMessage = statusMessage || (
    wardrobeQuery.isError
      ? "Couldn't load your wardrobe right now. You can still analyze a new outfit."
      : wardrobe.length === 0
        ? "No wardrobe entries yet. Analyze your first outfit photo."
        : ""
  );

  useEffect(() => {
    if (!selectedDetailsRequest || !outfitDetailsQuery.isError) {
      return;
    }

    setSelectedDetailsRequest(null);
    setStatusMessage("Could not load outfit details right now.");
    toast.error("Could not load outfit details.");
  }, [selectedDetailsRequest, outfitDetailsQuery.isError, outfitDetailsQuery.errorUpdatedAt]);

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
      if (outfitDetails?.selected_outfit?.outfit_id === deletedOutfitId) {
        setSelectedDetailsRequest(null);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["wardrobeDetails", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["stats", accessToken] }),
      ]);
    },
  });

  const deleteWardrobeEntry = async (outfitId: string) => {
    if (!accessToken) {
      return false;
    }

    setStatusMessage("");
    setDeletingOutfitId(outfitId);
    try {
      await deleteWardrobeMutation.mutateAsync(outfitId);
      toast.success("Outfit deleted.");
      onWardrobeChanged?.();
      return true;
    } catch {
      setStatusMessage("Could not delete this outfit right now. Please try again.");
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["wardrobeDetails", accessToken] }),
      ]);

      toast.success("Outfit name updated.");
      onWardrobeChanged?.();
    },
  });

  const renameOutfit = async (outfitId: string, styleLabel: string) => {
    if (!accessToken) {
      return false;
    }

    setStatusMessage("");
    setUpdatingOutfitId(outfitId);
    try {
      await renameOutfitMutation.mutateAsync({ outfitId, styleLabel });
      return true;
    } catch (error) {
      setStatusMessage("Could not update outfit name right now.");
      toast.error((error as Error).message || "Could not update outfit name right now.");
      return false;
    } finally {
      setUpdatingOutfitId("");
    }
  };

  const openOutfitDetails = (photoId: string, outfitIndex: number | null = null) => {
    if (!accessToken) {
      return;
    }

    setStatusMessage("");
    setSelectedDetailsRequest({ photoId, outfitIndex });
  };

  const generateOutfitsMe = async (photoId: string, outfitIndex: number | null = null) => {
    if (!accessToken || !photoId) {
      return false;
    }

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

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wardrobe", accessToken] }),
        queryClient.invalidateQueries({ queryKey: buildDetailsQueryKey(photoId, outfitIndex) }),
        queryClient.invalidateQueries({ queryKey: ["stats", accessToken] }),
      ]);

      toast.success("OutfitsMe preview generated.");
      return payload;
    } catch (error) {
      toast.error((error as Error).message || "Failed to generate OutfitsMe preview.");
      return false;
    } finally {
      setOutfitsMeLoading(false);
    }
  };

  const refreshWardrobe = async () => {
    if (!accessToken) {
      return;
    }

    setStatusMessage("");
    const result = await wardrobeQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load outfits right now.");
    }
  };

  return {
    wardrobe,
    wardrobePage: currentPage,
    wardrobeHasMore,
    wardrobeLoading,
    wardrobeMessage,
    refreshWardrobe,
    nextWardrobePage: () => {
      setStatusMessage("");
      setCurrentPage((page) => page + 1);
    },
    prevWardrobePage: () => {
      setStatusMessage("");
      setCurrentPage((page) => Math.max(1, page - 1));
    },
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    generateOutfitsMe,
    outfitMeLoading,
    openOutfitDetails,
    closeOutfitDetails: () => setSelectedDetailsRequest(null),
    outfitDetails,
    outfitDetailsLoading,
    resetWardrobeState: () => {
      setStatusMessage("");
      setDeletingOutfitId("");
      setUpdatingOutfitId("");
      setOutfitsMeLoading(false);
      setCurrentPage(1);
      setSelectedDetailsRequest(null);
      queryClient.removeQueries({ queryKey: ["wardrobe", accessToken] });
      queryClient.removeQueries({ queryKey: ["wardrobeDetails", accessToken] });
    },
  };
}
