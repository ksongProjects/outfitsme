import { useEffect, useMemo, useState } from "react";

import { useSettingsContext } from "../../context/DashboardContext";
import BaseButton from "../ui/BaseButton";
import BaseCheckbox from "../ui/BaseCheckbox";
import BaseInput from "../ui/BaseInput";
import BaseSelect from "../ui/BaseSelect";

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "features", label: "Features" },
  { id: "costs", label: "Cost usage" },
  { id: "models", label: "Model keys" }
];

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
    modelOptions,
    costSummary,
    costSummaryLoading,
    loadCosts
  } = useSettingsContext();

  const [credentialsModelId, setCredentialsModelId] = useState(settingsForm.preferred_model || "");
  const [activeSection, setActiveSection] = useState("profile");

  useEffect(() => {
    loadCosts();
  }, []);

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

  const scrollToSection = (sectionId) => {
    const target = document.getElementById(`settings-${sectionId}`);
    if (!target) {
      return;
    }
    setActiveSection(sectionId);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section className="settings-layout">
      <div className="settings-span">
        <div className="tab-header">
          <div className="tab-header-title">
            <h2>Settings</h2>
            <p className="tab-header-subtext">Manage profile, security, features, costs, and model credentials.</p>
          </div>
        </div>
      </div>

      <aside className="settings-menu">
        {SETTINGS_SECTIONS.map((section) => (
          <BaseButton
            key={section.id}
            variant="menu"
            className={activeSection === section.id ? "active" : ""}
            onClick={() => scrollToSection(section.id)}
          >
            {section.label}
          </BaseButton>
        ))}
      </aside>

      <div className="settings-scroll-sections">
        <article id="settings-profile" className="settings-card settings-section-card">
          <h2>Profile</h2>
          <label htmlFor="settings-name">Display name</label>
          <BaseInput
            id="settings-name"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Your name"
          />
          <label htmlFor="settings-gender">Gender</label>
          <BaseSelect
            id="settings-gender"
            value={settingsForm.profile_gender || "unspecified"}
            onValueChange={(value) => setSettingsForm((prev) => ({ ...prev, profile_gender: value === "unspecified" ? "" : value }))}
            options={[
              { value: "unspecified", label: "Prefer not to say" },
              { value: "female", label: "Female" },
              { value: "male", label: "Male" },
              { value: "non-binary", label: "Non-binary" }
            ]}
            placeholder="Select gender"
          />
          <label htmlFor="settings-age">Age</label>
          <BaseInput
            id="settings-age"
            type="number"
            min={1}
            max={120}
            value={settingsForm.profile_age}
            onChange={(event) => setSettingsForm((prev) => ({ ...prev, profile_age: event.target.value }))}
            placeholder="Age"
          />
          <div className="button-row">
            <BaseButton variant="primary" onClick={saveProfile}>Save profile</BaseButton>
          </div>
        </article>

        <article id="settings-security" className="settings-card settings-section-card">
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

        <article id="settings-features" className="settings-card settings-section-card">
          <h2>Features</h2>
          <p className="subtext">Control optional generation and shopping features.</p>
          <div className="settings-feature-row">
            <div>
              <p><strong>Outfit image generation</strong></p>
              <p className="subtext">
                Generate item thumbnails (max 300 x 300) and composed outfit visuals. Monthly limit: 5 custom outfits.
              </p>
            </div>
            <BaseCheckbox
              checked={Boolean(settingsForm.enable_outfit_image_generation)}
              onCheckedChange={(value) => setSettingsForm((prev) => ({ ...prev, enable_outfit_image_generation: Boolean(value) }))}
            />
          </div>
          <div className="settings-feature-row feature-disabled">
            <div>
              <p><strong>Online store search</strong></p>
              <p className="subtext">
                Search retailers for similar items with price, stock, and shipping. Currently unavailable.
              </p>
            </div>
            <BaseCheckbox checked={false} disabled />
          </div>
          <div className="button-row">
            <BaseButton variant="primary" onClick={saveModelSettings}>Save feature settings</BaseButton>
          </div>
        </article>

        <article id="settings-costs" className="settings-card settings-section-card">
          <h2>Cost usage</h2>
          {costSummaryLoading ? (
            <p className="subtext">Loading cost usage...</p>
          ) : costSummary ? (
            <>
              <p className="subtext">
                Month start: {costSummary.month_start_utc ? new Date(costSummary.month_start_utc).toLocaleString() : "-"}
              </p>
              <ul className="compact-list">
                <li>Analysis runs: <strong>{costSummary.analysis_runs ?? 0}</strong></li>
                <li>Custom outfit generations: <strong>{costSummary.custom_outfit_generations ?? 0}</strong></li>
              </ul>
              <h4>Estimated costs (USD)</h4>
              <ul className="compact-list">
                <li>Analysis: <strong>${costSummary.estimated_costs_usd?.analysis ?? 0}</strong></li>
                <li>Outfit image generation: <strong>${costSummary.estimated_costs_usd?.outfit_image_generation ?? 0}</strong></li>
                <li>Item image generation: <strong>${costSummary.estimated_costs_usd?.item_image_generation ?? 0}</strong></li>
                <li>Total: <strong>${costSummary.estimated_costs_usd?.total ?? 0}</strong></li>
              </ul>
              <p className="subtext">
                Unit rates: analysis ${costSummary.unit_costs_usd?.analysis ?? 0}, outfit image $
                {costSummary.unit_costs_usd?.outfit_image_generation ?? 0}, item image $
                {costSummary.unit_costs_usd?.item_image_generation ?? 0}
              </p>
            </>
          ) : (
            <p className="subtext">Cost usage unavailable.</p>
          )}
          <div className="button-row">
            <BaseButton variant="ghost" onClick={loadCosts}>Refresh costs</BaseButton>
          </div>
        </article>

        <article id="settings-models" className="settings-card settings-section-card">
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
      </div>
    </section>
  );
}
