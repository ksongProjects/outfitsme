import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";
import { API_BASE } from "../lib/apiBase";

export function useSettingsState({ session, accessToken }) {
  const queryClient = useQueryClient();
  const [profileName, setProfileName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [profilePhotoUrl, setProfilePhotoUrl] = useState("");
  const [profilePhotoUploading, setProfilePhotoUploading] = useState(false);
  const [userRole, setUserRole] = useState("trial");
  const [settingsForm, setSettingsForm] = useState({
    profile_gender: "",
    profile_age: "",
    enable_outfit_image_generation: false,
    enable_online_store_search: false,
    enable_accessory_analysis: false
  });

  useEffect(() => {
    setProfileName(session?.user?.user_metadata?.full_name || "");
  }, [session]);

  const preferencesQuery = useQuery({
    queryKey: ["settings-preferences", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return { settings: {} };
      }
      const response = await fetch(`${API_BASE}/api/settings/preferences`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        throw new Error("Unable to load settings.");
      }
      return await response.json();
    },
    enabled: false,
    staleTime: 20_000
  });

  const costsQuery = useQuery({
    queryKey: ["settings-costs", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return { costs: null };
      }
      const response = await fetch(`${API_BASE}/api/settings/costs`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        throw new Error("Unable to load cost summary.");
      }
      return await response.json();
    },
    enabled: false,
    staleTime: 20_000
  });

  const loadPreferences = async () => {
    if (!accessToken) {
      return;
    }

    const result = await preferencesQuery.refetch();
    if (result.isError) {
      return;
    }

    const current = result.data?.settings || {};
    setUserRole(current.user_role || "trial");
    setSettingsForm((prev) => ({
      ...prev,
      profile_gender: current.profile_gender || "",
      profile_age: current.profile_age ? String(current.profile_age) : "",
      enable_outfit_image_generation: Boolean(current.enable_outfit_image_generation),
      enable_online_store_search: Boolean(current.enable_online_store_search),
      enable_accessory_analysis: Boolean(current.enable_accessory_analysis)
    }));
    setProfilePhotoUrl(current.profile_photo_url || "");
  };

  const loadCosts = async () => {
    if (!accessToken) {
      return;
    }
    await costsQuery.refetch();
  };

  const savePreferencesMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await fetch(`${API_BASE}/api/settings/preferences`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to save settings.");
      }

      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["settings-preferences", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["settings-costs", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

  const saveProfile = async () => {
    const name = profileName.trim();
    const { error: authError } = await supabase.auth.updateUser({
      data: {
        full_name: name,
        gender: settingsForm.profile_gender || null,
        age: settingsForm.profile_age ? Number(settingsForm.profile_age) : null
      }
    });
    if (authError) {
      toast.error(authError.message);
      return;
    }
    try {
      await savePreferencesMutation.mutateAsync({
        profile_gender: settingsForm.profile_gender,
        profile_age: settingsForm.profile_age,
        enable_outfit_image_generation: settingsForm.enable_outfit_image_generation,
        enable_online_store_search: settingsForm.enable_online_store_search,
        enable_accessory_analysis: settingsForm.enable_accessory_analysis
      });
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err.message || "Profile updated, but settings failed to save.");
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
        enable_online_store_search: settingsForm.enable_online_store_search,
        enable_accessory_analysis: settingsForm.enable_accessory_analysis
      });
      toast.success("Feature settings updated.");
      await loadPreferences();
    } catch (err) {
      toast.error(err.message || "Failed to save feature settings.");
    }
  };

  const saveEmail = async () => {
    const nextEmail = newEmail.trim();
    if (!nextEmail) {
      toast.error("Enter a new email.");
      return;
    }
    const { error: authError } = await supabase.auth.updateUser({ email: nextEmail });
    if (authError) {
      toast.error(authError.message);
      return;
    }
    setNewEmail("");
    toast.success("Verification email sent to your new address.");
  };

  const savePassword = async () => {
    if (!newPassword) {
      toast.error("Enter a new password.");
      return;
    }
    const { error: authError } = await supabase.auth.updateUser({ password: newPassword });
    if (authError) {
      toast.error(authError.message);
      return;
    }
    setNewPassword("");
    toast.success("Password updated.");
  };

  const uploadProfilePhoto = async (file) => {
    if (!accessToken || !file) {
      return;
    }
    setProfilePhotoUploading(true);
    try {
      const resizedFile = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
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
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
              if (blob) {
                resolve(new File([blob], file.name, {
                  type: file.type || "image/jpeg",
                  lastModified: Date.now()
                }));
              } else {
                reject(new Error("Image processing failed"));
              }
            }, file.type || "image/jpeg", 0.9);
          };
          img.onerror = () => reject(new Error("Invalid image format"));
          img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Could not read file"));
        reader.readAsDataURL(file);
      });

      const formData = new FormData();
      formData.append("image", resizedFile);
      const response = await fetch(`${API_BASE}/api/settings/profile-photo`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`
        },
        body: formData
      });
      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to upload profile photo.");
      }
      const payload = await response.json();
      setProfilePhotoUrl(payload.profile_photo_url || "");
      toast.success("Profile photo updated.");
      await queryClient.invalidateQueries({ queryKey: ["settings-preferences", accessToken] });
    } catch (err) {
      toast.error(err.message || "Failed to upload profile photo.");
    } finally {
      setProfilePhotoUploading(false);
    }
  };

  return {
    profileName,
    setProfileName,
    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    settingsForm,
    setSettingsForm,
    profilePhotoUrl,
    userRole,
    profilePhotoUploading,
    costSummary: costsQuery.data?.costs || null,
    costSummaryLoading: costsQuery.isFetching,
    loadPreferences,
    loadCosts,
    uploadProfilePhoto,
    saveProfile,
    saveEmail,
    savePassword,
    saveFeatureSettings
  };
}
