import { useEffect, useState } from "react";
import Link from "next/link";

import { useSettingsContext } from "../../context/DashboardContext";
import BaseButton from "../ui/BaseButton";
import BaseCheckbox from "../ui/BaseCheckbox";
import BaseInput from "../ui/BaseInput";
import BaseSelect from "../ui/BaseSelect";
import ImageUploadField from "../ui/ImageUploadField";

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "security", label: "Security" },
  { id: "features", label: "Features" },
  { id: "costs", label: "Cost usage" }
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
    profilePhotoUrl,
    userRole,
    profilePhotoUploading,
    saveFeatureSettings,
    costSummary,
    costSummaryLoading,
    loadCosts,
    uploadProfilePhoto
  } = useSettingsContext();

  const [activeSection, setActiveSection] = useState("profile");
  const [profilePhotoFile, setProfilePhotoFile] = useState(null);

  useEffect(() => {
    loadCosts();
  }, []);

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
            <p className="tab-header-subtext">Manage profile, security, feature access, and trial usage.</p>
            <p className="subtext">
              Review our <Link href="/terms">Terms of Service</Link>.
            </p>
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
          {!profilePhotoUrl && <label>Reference photo</label>}
          {profilePhotoUrl ? (
            <img src={profilePhotoUrl} alt="Profile reference" className="profile-photo-preview" />
          ) : (
            <p className="subtext">No reference photo uploaded yet.</p>
          )}
          <ImageUploadField
            id="profile-photo-upload"
            fileName={profilePhotoFile?.name || ""}
            onFileSelect={(selectedFile) => setProfilePhotoFile(selectedFile)}
            title="Drag and drop a profile reference photo"
            subtext="Choose an existing image or take a new profile photo"
            emptyText="No profile photo selected"
            disabled={profilePhotoUploading}
          />
          <div className="button-row">
            <BaseButton
              variant="ghost"
              onClick={() => uploadProfilePhoto(profilePhotoFile)}
              disabled={!profilePhotoFile || profilePhotoUploading}
            >
              {profilePhotoUploading ? "Uploading..." : "Upload reference photo"}
            </BaseButton>
          </div>
          <label htmlFor="settings-name">Display name</label>
          <p className="subtext">Access level: <strong>{userRole}</strong></p>
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
          <p className="subtext">
            OutfitsMe now uses a managed Gemini key for the shared trial. Turn on image generation only if you want
            your daily trial allowance used for outfit previews.
          </p>
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
          <div className="settings-feature-row">
            <div>
              <p><strong>Accessory analysis</strong></p>
              <p className="subtext">
                Include accessories like bags, rings, earrings, and jewelry during photo analysis.
              </p>
            </div>
            <BaseCheckbox
              checked={Boolean(settingsForm.enable_accessory_analysis)}
              onCheckedChange={(value) => setSettingsForm((prev) => ({ ...prev, enable_accessory_analysis: Boolean(value) }))}
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
            <BaseButton variant="primary" onClick={saveFeatureSettings}>Save feature settings</BaseButton>
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
              <h4>Token estimate</h4>
              <ul className="compact-list">
                <li>Input tokens: <strong>{costSummary.token_usage_estimate?.total?.input_tokens ?? 0}</strong></li>
                <li>Output tokens: <strong>{costSummary.token_usage_estimate?.total?.output_tokens ?? 0}</strong></li>
                <li>Total tokens: <strong>{costSummary.token_usage_estimate?.total?.total_tokens ?? 0}</strong></li>
              </ul>
              <h4>Token-priced costs (USD)</h4>
              <ul className="compact-list">
                <li>Input token cost: <strong>${costSummary.estimated_token_costs_usd?.total?.input ?? 0}</strong></li>
                <li>Output token cost: <strong>${costSummary.estimated_token_costs_usd?.total?.output ?? 0}</strong></li>
                <li>Total token cost: <strong>${costSummary.estimated_token_costs_usd?.total?.total ?? 0}</strong></li>
              </ul>
              <p className="subtext">
                Unit rates: analysis ${costSummary.unit_costs_usd?.analysis ?? 0} (
                ${costSummary.unit_costs_usd?.analysis_input ?? 0} input + $
                {costSummary.unit_costs_usd?.analysis_output_image ?? 0} output), outfit image $
                {costSummary.unit_costs_usd?.outfit_image_generation ?? 0} ($
                {costSummary.unit_costs_usd?.outfit_image_input ?? 0} input + $
                {costSummary.unit_costs_usd?.outfit_image_output ?? 0} output), item image $
                {costSummary.unit_costs_usd?.item_image_generation ?? 0}
              </p>
              <p className="subtext">
                Token rates (per 1M): input ${costSummary.token_pricing_usd_per_1m?.input ?? 0}, output $
                {costSummary.token_pricing_usd_per_1m?.output ?? 0}
              </p>
              <p className="subtext">
                Cost formulas: analysis uses 1 input call + 1 image output call, and OutfitsMe uses 1 input call +
                1 image output call per generated outfit image.
              </p>
              <p className="subtext">
                Token source: {costSummary.token_usage_estimate?.source || "n/a"}
              </p>
            </>
          ) : (
            <p className="subtext">Cost usage unavailable.</p>
          )}
          <div className="button-row">
            <BaseButton variant="ghost" onClick={loadCosts}>Refresh costs</BaseButton>
          </div>
        </article>
      </div>
    </section>
  );
}
