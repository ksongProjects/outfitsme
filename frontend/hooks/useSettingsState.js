import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";
import { API_BASE } from "../lib/apiBase";

export function useSettingsState({ session, accessToken, onModelSettingsUpdated }) {
  const queryClient = useQueryClient();
  const [profileName, setProfileName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    preferred_model: "gemini-2.5-flash",
    gemini_api_key: "",
    aws_region: "",
    aws_bedrock_agent_id: "",
    aws_bedrock_agent_alias_id: "",
    profile_gender: "",
    profile_age: "",
    enable_outfit_image_generation: false,
    enable_online_store_search: false
  });

  useEffect(() => {
    setProfileName(session?.user?.user_metadata?.full_name || "");
  }, [session]);

  const modelSettingsQuery = useQuery({
    queryKey: ["model-settings", accessToken],
    queryFn: async () => {
      if (!accessToken) {
        return { settings: {} };
      }
      const response = await fetch(`${API_BASE}/api/settings/model-keys`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        throw new Error("Unable to load model settings.");
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

  const loadModelSettings = async () => {
    if (!accessToken) {
      return;
    }

    const result = await modelSettingsQuery.refetch();
    if (result.isError) {
      return;
    }

    const payload = result.data || {};
    const current = payload.settings || {};
    setSettingsForm((prev) => ({
      ...prev,
      preferred_model: current.preferred_model || prev.preferred_model,
      aws_region: current.aws_region || "",
      aws_bedrock_agent_id: current.aws_bedrock_agent_id || "",
      aws_bedrock_agent_alias_id: current.aws_bedrock_agent_alias_id || "",
      profile_gender: current.profile_gender || "",
      profile_age: current.profile_age ? String(current.profile_age) : "",
      enable_outfit_image_generation: Boolean(current.enable_outfit_image_generation),
      enable_online_store_search: Boolean(current.enable_online_store_search)
    }));
  };

  const loadCosts = async () => {
    if (!accessToken) {
      return;
    }
    await costsQuery.refetch();
  };

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
      await saveModelSettingsMutation.mutateAsync(settingsForm);
      toast.success("Profile updated.");
    } catch (err) {
      toast.error(err.message || "Profile updated, but feature profile settings failed to save.");
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

  const saveModelSettings = async () => {
    if (!accessToken) {
      return;
    }

    try {
      await saveModelSettingsMutation.mutateAsync(settingsForm);
      setSettingsForm((prev) => ({
        ...prev,
        gemini_api_key: ""
      }));
      toast.success("Model settings updated.");
      if (onModelSettingsUpdated) {
        onModelSettingsUpdated();
      }
      loadModelSettings();
    } catch (err) {
      toast.error(err.message || "Failed to save model settings.");
    }
  };

  const saveModelSettingsMutation = useMutation({
    mutationFn: async (payload) => {
      const response = await fetch(`${API_BASE}/api/settings/model-keys`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to save model settings.");
      }

      return await response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["model-settings", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["settings-costs", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["models", accessToken] });
      await queryClient.invalidateQueries({ queryKey: ["stats", accessToken] });
    }
  });

  return {
    profileName,
    setProfileName,
    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    settingsForm,
    setSettingsForm,
    costSummary: costsQuery.data?.costs || null,
    costSummaryLoading: costsQuery.isFetching,
    loadModelSettings,
    loadCosts,
    saveProfile,
    saveEmail,
    savePassword,
    saveModelSettings
  };
}
