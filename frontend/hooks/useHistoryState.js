import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useHistoryState({ accessToken }) {
  const queryClient = useQueryClient();
  const [deletingPhotoId, setDeletingPhotoId] = useState("");

  const historyQuery = useQuery({
    queryKey: ["history", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return [];
      }
      const response = await fetch(`${API_BASE}/api/history`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Unable to load analysis history.");
      }
      const payload = await response.json();
      return payload.history || [];
    },
    enabled: Boolean(accessToken),
    staleTime: 20_000
  });

  const history = historyQuery.data || [];
  const historyLoading = historyQuery.isFetching;
  const historyMessage = historyQuery.isError
    ? "Couldn't load history right now."
    : (history.length === 0 ? "No analysis history yet. Analyze a photo to populate this table." : "");

  const deletePhotoMutation = useMutation({
    mutationFn: async (photoId) => {
      const response = await fetch(`${API_BASE}/api/history/photos/${photoId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to delete photo.");
      }
      return await response.json();
    },
    onSuccess: async (_data, deletedPhotoId) => {
      queryClient.setQueryData(["history", accessToken], (current) => {
        const rows = Array.isArray(current) ? current : [];
        return rows.filter((row) => row.photo_id !== deletedPhotoId);
      });
      queryClient.setQueryData(["wardrobe", accessToken], (current) => {
        const rows = Array.isArray(current) ? current : [];
        return rows.filter((row) => row.photo_id !== deletedPhotoId);
      });
      await queryClient.invalidateQueries({ queryKey: ["items", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

  const loadHistory = async () => {
    const result = await historyQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load history.");
      return;
    }
    if ((result.data || []).length === 0) {
      toast.info("No history yet.");
    }
  };

  const deleteHistoryPhoto = async (photoId) => {
    if (!accessToken || !photoId) {
      return false;
    }
    setDeletingPhotoId(photoId);
    try {
      await deletePhotoMutation.mutateAsync(photoId);
      toast.success("Photo and related outfits were deleted.");
      return true;
    } catch (_err) {
      toast.error("Could not delete photo right now.");
      return false;
    } finally {
      setDeletingPhotoId("");
    }
  };

  const resetHistoryState = () => {
    setDeletingPhotoId("");
    queryClient.removeQueries({ queryKey: ["history", accessToken] });
  };

  return {
    history,
    historyLoading,
    historyMessage,
    loadHistory,
    deleteHistoryPhoto,
    deletingPhotoId,
    resetHistoryState
  };
}
