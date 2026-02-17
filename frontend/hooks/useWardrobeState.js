import { useState } from "react";
import { toast } from "sonner";

import { API_BASE } from "../lib/apiBase";

export function useWardrobeState({ accessToken, onWardrobeChanged }) {
  const [wardrobe, setWardrobe] = useState([]);
  const [wardrobeLoading, setWardrobeLoading] = useState(false);
  const [wardrobeMessage, setWardrobeMessage] = useState("");
  const [originalPhotoUrl, setOriginalPhotoUrl] = useState("");

  const loadWardrobe = async () => {
    if (!accessToken) {
      return;
    }

    setWardrobeLoading(true);
    setWardrobeMessage("");

    try {
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
      const entries = wardrobeJson.wardrobe || [];
      setWardrobe(entries);
      setWardrobeMessage(entries.length === 0 ? "No wardrobe entries yet. Analyze your first outfit photo." : "");
      if (entries.length === 0) {
        toast.info("No outfits yet. Analyze your first photo.");
      } else {
        toast.success("Outfits loaded.");
      }
    } catch (_err) {
      setWardrobe([]);
      setWardrobeMessage("Couldn't load your wardrobe right now. You can still analyze a new outfit.");
      toast.error("Couldn't load outfits right now.");
    } finally {
      setWardrobeLoading(false);
    }
  };

  const deleteWardrobeEntry = async (photoId) => {
    if (!accessToken) {
      return;
    }

    setWardrobeMessage("");
    const confirmed = window.confirm("Delete this outfit from your wardrobe?");
    if (!confirmed) {
      return;
    }

    try {
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

      setWardrobe((prev) => prev.filter((entry) => entry.photo_id !== photoId));
      setWardrobeMessage("Outfit removed.");
      toast.success("Outfit deleted.");
      if (onWardrobeChanged) {
        onWardrobeChanged();
      }
    } catch (_err) {
      setWardrobeMessage("Could not delete this outfit right now. Please try again.");
      toast.error("Could not delete outfit right now.");
    }
  };

  const openOriginalPhoto = async (photoId) => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/wardrobe/${photoId}/original`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to load original photo.");
      }

      const payload = await response.json();
      setOriginalPhotoUrl(payload.image_url || "");
      if (!payload.image_url) {
        toast.error("Original photo is unavailable.");
      }
    } catch (_err) {
      setWardrobeMessage("Could not load original photo right now.");
      toast.error("Could not load original photo.");
    }
  };

  const closeOriginalPhoto = () => setOriginalPhotoUrl("");

  const resetWardrobeState = () => {
    setWardrobe([]);
    setWardrobeMessage("");
    setOriginalPhotoUrl("");
  };

  return {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    openOriginalPhoto,
    originalPhotoUrl,
    closeOriginalPhoto,
    resetWardrobeState
  };
}
