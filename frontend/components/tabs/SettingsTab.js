import { useSettingsContext } from "../../context/DashboardContext";
import { useState } from "react";
import { useEffect, useMemo } from "react";
import BaseButton from "../ui/BaseButton";
import BaseInput from "../ui/BaseInput";
import BaseSelect from "../ui/BaseSelect";

export default function SettingsTab() {
  const {
    profileName,
    setProfileName,
    newEmail,
    setNewEmail,
    newPassword,
    setNewPassword,
    saveProfile,
    saveEmail,
    savePassword,
    settingsForm,
    setSettingsForm,
    saveModelSettings,
    modelOptions
  } = useSettingsContext();
  const [activeSection, setActiveSection] = useState("profile");
  const [credentialsModelId, setCredentialsModelId] = useState(settingsForm.preferred_model || "");

  useEffect(() => {
    if (!credentialsModelId) {
      setCredentialsModelId(settingsForm.preferred_model || modelOptions[0]?.id || "");
      return;
    }
    const exists = modelOptions.some((model) => model.id === credentialsModelId);
    if (!exists) {
      setCredentialsModelId(settingsForm.preferred_model || modelOptions[0]?.id || "");
    }
  }, [credentialsModelId, settingsForm.preferred_model, modelOptions]);

  const selectedCredentialsModel = useMemo(() => (
    modelOptions.find((model) => model.id === credentialsModelId) || null
  ), [modelOptions, credentialsModelId]);

  const selectedProvider = selectedCredentialsModel?.provider || "";
  const showGeminiInputs = selectedProvider === "gemini" || credentialsModelId.includes("gemini");
  const showBedrockAgentInputs = selectedProvider === "bedrock_agent" || credentialsModelId === "bedrock-agent";

  return (
    <section className="settings-layout">
      <div className="settings-span">
        <div className="tab-header">
          <div className="tab-header-title">
            <h2>Settings</h2>
            <p className="tab-header-subtext">Manage profile, security, and model credentials.</p>
          </div>
        </div>
      </div>
      <aside className="settings-menu">
          <BaseButton
            variant="menu"
            className={activeSection === "profile" ? "active" : ""}
            onClick={() => setActiveSection("profile")}
          >
            Profile
          </BaseButton>
          <BaseButton
            variant="menu"
            className={activeSection === "security" ? "active" : ""}
            onClick={() => setActiveSection("security")}
          >
            Security
          </BaseButton>
          <BaseButton
            variant="menu"
            className={activeSection === "models" ? "active" : ""}
            onClick={() => setActiveSection("models")}
          >
            Model keys
          </BaseButton>
        </aside>

        <div>
        {activeSection === "profile" ? (
          <article className="settings-card">
            <h2>Profile</h2>
            <label htmlFor="settings-name">Display name</label>
            <BaseInput
              id="settings-name"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Your name"
            />
            <div className="button-row">
              <BaseButton variant="primary" onClick={saveProfile}>Save name</BaseButton>
            </div>
          </article>
        ) : null}

        {activeSection === "security" ? (
          <article className="settings-card">
            <h2>Security</h2>
            <label htmlFor="settings-email">New email</label>
            <BaseInput
              id="settings-email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="new-email@example.com"
            />
            <div className="button-row">
              <BaseButton variant="ghost" onClick={saveEmail}>Change email (verification required)</BaseButton>
            </div>

            <label htmlFor="settings-password">New password</label>
            <BaseInput
              id="settings-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
            <div className="button-row">
              <BaseButton variant="ghost" onClick={savePassword}>Change password</BaseButton>
            </div>
          </article>
        ) : null}

        {activeSection === "models" ? (
          <article className="settings-card">
            <h2>Analysis model API keys</h2>
            <label htmlFor="preferred-model">Preferred model</label>
            <BaseSelect
              id="preferred-model"
              value={settingsForm.preferred_model}
              onValueChange={(value) => {
                setSettingsForm((prev) => ({ ...prev, preferred_model: value }));
                setCredentialsModelId(value);
              }}
              options={modelOptions.map((model) => ({ value: model.id, label: model.label }))}
              placeholder="Select model"
            />

            <label htmlFor="credentials-model">Configure credentials for</label>
            <BaseSelect
              id="credentials-model"
              value={credentialsModelId}
              onValueChange={(value) => setCredentialsModelId(value)}
              options={modelOptions.map((model) => ({ value: model.id, label: model.label }))}
              placeholder="Select model"
            />

            {showGeminiInputs ? (
              <>
                <label htmlFor="gemini-api-key">Gemini API key</label>
                <BaseInput
                  id="gemini-api-key"
                  value={settingsForm.gemini_api_key}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, gemini_api_key: event.target.value }))}
                  placeholder="AIza..."
                />
              </>
            ) : null}

            {showBedrockAgentInputs ? (
              <>
                <label htmlFor="aws-region">AWS region</label>
                <BaseInput
                  id="aws-region"
                  value={settingsForm.aws_region}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_region: event.target.value }))}
                  placeholder="us-east-1"
                />

                <label htmlFor="aws-bedrock-agent-id">Bedrock agent ID</label>
                <BaseInput
                  id="aws-bedrock-agent-id"
                  value={settingsForm.aws_bedrock_agent_id}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_bedrock_agent_id: event.target.value }))}
                  placeholder="ABCDEFGHIJ"
                />

                <label htmlFor="aws-bedrock-agent-alias-id">Bedrock agent alias ID</label>
                <BaseInput
                  id="aws-bedrock-agent-alias-id"
                  value={settingsForm.aws_bedrock_agent_alias_id}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_bedrock_agent_alias_id: event.target.value }))}
                  placeholder="TSTALIASID"
                />
              </>
            ) : null}

            <div className="button-row">
              <BaseButton variant="primary" onClick={saveModelSettings}>Save model settings</BaseButton>
            </div>
          </article>
        ) : null}
        </div>
    </section>
  );
}
