import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "../lib/supabaseClient";
import { API_BASE } from "../lib/apiBase";

export function useSettingsState({ session, accessToken, onModelSettingsUpdated }) {
  const [profileName, setProfileName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [settingsForm, setSettingsForm] = useState({
    preferred_model: "gemini-2.5-flash",
    gemini_api_key: "",
    aws_access_key_id: "",
    aws_secret_access_key: "",
    aws_session_token: "",
    aws_region: "",
    aws_bedrock_agent_id: "",
    aws_bedrock_agent_alias_id: ""
  });

  useEffect(() => {
    setProfileName(session?.user?.user_metadata?.full_name || "");
  }, [session]);

  const loadModelSettings = async () => {
    if (!accessToken) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/settings/model-keys`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const current = payload.settings || {};
      setSettingsForm((prev) => ({
        ...prev,
        preferred_model: current.preferred_model || prev.preferred_model,
        aws_region: current.aws_region || "",
        aws_bedrock_agent_id: current.aws_bedrock_agent_id || "",
        aws_bedrock_agent_alias_id: current.aws_bedrock_agent_alias_id || ""
      }));
    } catch (_err) {
      // Optional UI helper only.
    }
  };

  const saveProfile = async () => {
    const name = profileName.trim();
    const { error: authError } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (authError) {
      toast.error(authError.message);
      return;
    }
    toast.success("Name updated.");
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
      const response = await fetch(`${API_BASE}/api/settings/model-keys`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(settingsForm)
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody.error || "Failed to save model settings.");
      }

      setSettingsForm((prev) => ({
        ...prev,
        gemini_api_key: "",
        aws_access_key_id: "",
        aws_secret_access_key: "",
        aws_session_token: ""
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

  return {
    profileName,
    setProfileName,
    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    settingsForm,
    setSettingsForm,
    loadModelSettings,
    saveProfile,
    saveEmail,
    savePassword,
    saveModelSettings
  };
}
