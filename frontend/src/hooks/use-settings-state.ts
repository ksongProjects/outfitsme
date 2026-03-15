"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { API_BASE } from "@/lib/api-base";
import { authClient } from "@/lib/auth-client";
import type { CostSummary, SettingsFormState } from "@/lib/types";

type SessionLike = {
  user?: {
    name?: string | null;
    email?: string | null;
  };
} | null;

const SETTINGS_STALE_MS = 5 * 60 * 1000;
const COSTS_STALE_MS = 60 * 1000;

const emptySettingsForm = (): SettingsFormState => ({
  profile_gender: "",
  profile_age: "",
  enable_outfit_image_generation: false,
  enable_online_store_search: false,
  enable_accessory_analysis: false,
});

const toSettingsForm = (settings: Record<string, unknown>): SettingsFormState => ({
  profile_gender: String(settings.profile_gender || ""),
  profile_age: settings.profile_age ? String(settings.profile_age) : "",
  enable_outfit_image_generation: Boolean(settings.enable_outfit_image_generation),
  enable_online_store_search: false,
  enable_accessory_analysis: Boolean(settings.enable_accessory_analysis),
});

export function useSettingsState({
  session,
  accessToken,
}: {
  session: SessionLike;
  accessToken: string;
}) {
  const queryClient = useQueryClient();
  const [profileName, setProfileName] = useState("");
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [settingsForm, setSettingsForm] = useState<SettingsFormState>(emptySettingsForm);

  const preferencesQuery = useQuery({
    queryKey: ["settings-preferences", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/settings/preferences`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load settings.");
      }

      return response.json() as Promise<{ settings?: Record<string, unknown> }>;
    },
    enabled: Boolean(accessToken),
    staleTime: SETTINGS_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const costsQuery = useQuery({
    queryKey: ["settings-costs", accessToken],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/api/settings/costs`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new Error("Unable to load cost summary.");
      }

      return response.json() as Promise<{ costs?: CostSummary | null }>;
    },
    enabled: Boolean(accessToken),
    staleTime: COSTS_STALE_MS,
    refetchOnWindowFocus: false,
  });

  const preferences = useMemo(
    () => (preferencesQuery.data?.settings ?? {}) as Record<string, unknown>,
    [preferencesQuery.data?.settings]
  );
  const userRole = String(preferences.user_role || "trial");
  const profilePhotoUrl = String(preferences.profile_photo_url || "");

  useEffect(() => {
    setProfileName(session?.user?.name || "");
  }, [session]);

  useEffect(() => {
    if (!preferencesQuery.dataUpdatedAt) {
      return;
    }

    setSettingsForm(toSettingsForm(preferences));
  }, [preferences, preferencesQuery.dataUpdatedAt]);

  const savePreferencesMutation = useMutation({
    mutationFn: async (payload: Partial<SettingsFormState>) => {
      const response = await fetch(`${API_BASE}/api/settings/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to save settings.");
      }

      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings-preferences", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["settings-costs", accessToken] }),
        queryClient.invalidateQueries({ queryKey: ["stats", accessToken] }),
      ]);
    },
  });

  const saveProfile = async () => {
    const name = profileName.trim();
    try {
      if (name && name !== (session?.user?.name || "").trim()) {
        await authClient.$fetch("/update-user", {
          method: "POST",
          body: { name },
        });
      }

      await savePreferencesMutation.mutateAsync({
        profile_gender: settingsForm.profile_gender,
        profile_age: settingsForm.profile_age,
        enable_outfit_image_generation: settingsForm.enable_outfit_image_generation,
        enable_online_store_search: false,
        enable_accessory_analysis: settingsForm.enable_accessory_analysis,
      });

      toast.success("Profile updated.");
    } catch (error) {
      toast.error((error as Error).message || "Profile could not be updated.");
    }
  };

  const saveFeatureSettings = async () => {
    if (!accessToken) {
      return;
    }

    try {
      await savePreferencesMutation.mutateAsync({
        profile_gender: settingsForm.profile_gender,
        profile_age: settingsForm.profile_age,
        enable_outfit_image_generation: settingsForm.enable_outfit_image_generation,
        enable_online_store_search: false,
        enable_accessory_analysis: settingsForm.enable_accessory_analysis,
      });
      toast.success("Feature settings updated.");
    } catch (error) {
      toast.error((error as Error).message || "Failed to save feature settings.");
    }
  };

  const uploadProfilePhoto = async (file: File | null) => {
    if (!accessToken || !file) {
      return;
    }

    setProfilePhotoUploading(true);
    try {
      const resizedFile = await new Promise<File>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const targetSize = 768;
            let width = img.width;
            let height = img.height;

            if (width > targetSize || height > targetSize) {
              if (width > height) {
                height = Math.round((height * targetSize) / width);
                width = targetSize;
              } else {
                width = Math.round((width * targetSize) / height);
                height = targetSize;
              }
            }

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Image processing failed"));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error("Image processing failed"));
                  return;
                }
                resolve(
                  new File([blob], file.name, {
                    type: file.type || "image/jpeg",
                    lastModified: Date.now(),
                  })
                );
              },
              file.type || "image/jpeg",
              0.9
            );
          };
          img.onerror = () => reject(new Error("Invalid image format"));
          img.src = String(event.target?.result || "");
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const formData = new FormData();
      formData.append("image", resizedFile);
      const response = await fetch(`${API_BASE}/api/settings/profile-photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to upload profile photo.");
      }

      toast.success("Profile photo updated.");
      await queryClient.invalidateQueries({ queryKey: ["settings-preferences", accessToken] });
    } catch (error) {
      toast.error((error as Error).message || "Failed to upload profile photo.");
    } finally {
      setProfilePhotoUploading(false);
    }
  };

  const refreshCosts = async () => {
    if (!accessToken) {
      return;
    }

    const result = await costsQuery.refetch();
    if (result.isError) {
      toast.error("Couldn't load cost usage.");
    }
  };

  return {
    profileName,
    setProfileName,
    settingsForm,
    setSettingsForm,
    profilePhotoUrl,
    userRole,
    profilePhotoUploading,
    costSummary: (costsQuery.data?.costs || null) as CostSummary | null,
    costSummaryLoading: costsQuery.isLoading || costsQuery.isFetching,
    refreshCosts,
    uploadProfilePhoto,
    saveProfile,
    saveFeatureSettings,
  };
}
