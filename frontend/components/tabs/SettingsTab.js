import { useSettingsContext } from "../../context/DashboardContext";

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

  return (
    <section className="settings-grid">
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

      <article className="settings-card">
        <h2>Analysis model API keys</h2>
        <label htmlFor="preferred-model">Preferred model</label>
        <select
          id="preferred-model"
          className="text-input"
          value={settingsForm.preferred_model}
          onChange={(event) => setSettingsForm((prev) => ({ ...prev, preferred_model: event.target.value }))}
        >
          {modelOptions.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>

        <label htmlFor="gemini-api-key">Gemini API key</label>
        <input
          id="gemini-api-key"
          className="text-input"
          value={settingsForm.gemini_api_key}
          onChange={(event) => setSettingsForm((prev) => ({ ...prev, gemini_api_key: event.target.value }))}
          placeholder="AIza..."
        />

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

        <label htmlFor="aws-bedrock-model">Bedrock model ID override (optional)</label>
        <input
          id="aws-bedrock-model"
          className="text-input"
          value={settingsForm.aws_bedrock_model_id}
          onChange={(event) => setSettingsForm((prev) => ({ ...prev, aws_bedrock_model_id: event.target.value }))}
          placeholder="amazon.nova-lite-v1:0"
        />

        <div className="button-row">
          <button className="primary-btn" onClick={saveModelSettings}>Save model settings</button>
        </div>
      </article>
    </section>
  );
}
