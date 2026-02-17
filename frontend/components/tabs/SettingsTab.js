import { useSettingsContext } from "../../context/DashboardContext";
import { useState } from "react";
import { useEffect, useMemo } from "react";

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
        <div className="toolbar-row">
          <h2>Settings</h2>
        </div>
      </div>
      <aside className="settings-menu">
          <button
            className={`settings-menu-btn ${activeSection === "profile" ? "active" : ""}`}
            onClick={() => setActiveSection("profile")}
          >
            Profile
          </button>
          <button
            className={`settings-menu-btn ${activeSection === "security" ? "active" : ""}`}
            onClick={() => setActiveSection("security")}
          >
            Security
          </button>
          <button
            className={`settings-menu-btn ${activeSection === "models" ? "active" : ""}`}
            onClick={() => setActiveSection("models")}
          >
            Model keys
          </button>
        </aside>

        <div>
        {activeSection === "profile" ? (
          <article className="settings-card">
            <h2>Profile</h2>
            <label htmlFor="settings-name">Display name</label>
            <input
              id="settings-name"
              className="text-input"
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              placeholder="Your name"
            />
            <div className="button-row">
              <button className="primary-btn" onClick={saveProfile}>Save name</button>
            </div>
          </article>
        ) : null}

        {activeSection === "security" ? (
          <article className="settings-card">
            <h2>Security</h2>
            <label htmlFor="settings-email">New email</label>
            <input
              id="settings-email"
              className="text-input"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
              placeholder="new-email@example.com"
            />
            <div className="button-row">
              <button className="ghost-btn" onClick={saveEmail}>Change email (verification required)</button>
            </div>

            <label htmlFor="settings-password">New password</label>
            <input
              id="settings-password"
              type="password"
              className="text-input"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="New password"
            />
            <div className="button-row">
              <button className="ghost-btn" onClick={savePassword}>Change password</button>
            </div>
          </article>
        ) : null}

        {activeSection === "models" ? (
          <article className="settings-card">
            <h2>Analysis model API keys</h2>
            <label htmlFor="preferred-model">Preferred model</label>
            <select
              id="preferred-model"
              className="text-input"
              value={settingsForm.preferred_model}
              onChange={(event) => {
                const value = event.target.value;
                setSettingsForm((prev) => ({ ...prev, preferred_model: value }));
                setCredentialsModelId(value);
              }}
            >
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>

            <label htmlFor="credentials-model">Configure credentials for</label>
            <select
              id="credentials-model"
              className="text-input"
              value={credentialsModelId}
              onChange={(event) => setCredentialsModelId(event.target.value)}
            >
              {modelOptions.map((model) => (
                <option key={`credentials-${model.id}`} value={model.id}>
                  {model.label}
                </option>
              ))}
            </select>

            {showGeminiInputs ? (
              <>
                <label htmlFor="gemini-api-key">Gemini API key</label>
                <input
                  id="gemini-api-key"
                  className="text-input"
                  value={settingsForm.gemini_api_key}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, gemini_api_key: event.target.value }))}
                  placeholder="AIza..."
                />
              </>
            ) : null}

            {showBedrockAgentInputs ? (
              <>
                <label htmlFor="aws-access-key">AWS access key ID</label>
                <input
                  id="aws-access-key"
                  className="text-input"
                  value={settingsForm.aws_access_key_id}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_access_key_id: event.target.value }))}
                  placeholder="AKIA..."
                />

                <label htmlFor="aws-secret-key">AWS secret access key</label>
                <input
                  id="aws-secret-key"
                  type="password"
                  className="text-input"
                  value={settingsForm.aws_secret_access_key}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_secret_access_key: event.target.value }))}
                  placeholder="AWS secret"
                />

                <label htmlFor="aws-session-token">AWS session token (optional)</label>
                <input
                  id="aws-session-token"
                  type="password"
                  className="text-input"
                  value={settingsForm.aws_session_token}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_session_token: event.target.value }))}
                  placeholder="Temporary credentials only"
                />

                <label htmlFor="aws-region">AWS region</label>
                <input
                  id="aws-region"
                  className="text-input"
                  value={settingsForm.aws_region}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_region: event.target.value }))}
                  placeholder="us-east-1"
                />

                <label htmlFor="aws-bedrock-agent-id">Bedrock agent ID</label>
                <input
                  id="aws-bedrock-agent-id"
                  className="text-input"
                  value={settingsForm.aws_bedrock_agent_id}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_bedrock_agent_id: event.target.value }))}
                  placeholder="ABCDEFGHIJ"
                />

                <label htmlFor="aws-bedrock-agent-alias-id">Bedrock agent alias ID</label>
                <input
                  id="aws-bedrock-agent-alias-id"
                  className="text-input"
                  value={settingsForm.aws_bedrock_agent_alias_id}
                  onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_bedrock_agent_alias_id: event.target.value }))}
                  placeholder="TSTALIASID"
                />
              </>
            ) : null}

            <div className="button-row">
              <button className="primary-btn" onClick={saveModelSettings}>Save model settings</button>
            </div>
          </article>
        ) : null}
        </div>
    </section>
  );
}
