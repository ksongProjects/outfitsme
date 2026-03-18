"use client";

import { useState } from "react";
import Link from "next/link";

import { useSettingsContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import ImageUploadField from "@/components/app/ui/ImageUploadField";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SETTINGS_SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "features", label: "Features" },
  { id: "costs", label: "Cost usage" },
];

const GENDER_LABELS: Record<string, string> = {
  unspecified: "Prefer not to say",
  female: "Female",
  male: "Male",
  "non-binary": "Non-binary",
};

export default function SettingsTab() {
  const {
    profileName,
    setProfileName,
    saveProfile,
    settingsForm,
    setSettingsForm,
    profilePhotoUrl,
    userRole,
    profilePhotoUploading,
    saveFeatureSettings,
    costSummary,
    costSummaryLoading,
    refreshCosts,
    uploadProfilePhoto,
  } = useSettingsContext();

  const [activeSection, setActiveSection] = useState("profile");
  const [profilePhotoFile, setProfilePhotoFile] = useState<File | null>(null);
  const [profilePreviewOpen, setProfilePreviewOpen] = useState(false);

  const scrollToSection = (sectionId: string) => {
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
            <span className="section-kicker">Account</span>
            <h2>Settings</h2>
            <p className="tab-header-subtext">Manage your profile, feature access, and the operational side of your AI wardrobe.</p>
            <p className="subtext">
              Review the <Link href="/terms">Terms of Service</Link> and <Link href="/privacy">Privacy Policy</Link> for deployment-ready legal coverage.
            </p>
          </div>
        </div>
      </div>

      <aside className="settings-menu">
        {SETTINGS_SECTIONS.map((section) => (
          <Button
            key={section.id}
            variant={activeSection === section.id ? "secondary" : "outline"}
            className="justify-start"
            onClick={() => scrollToSection(section.id)}
          >
            {section.label}
          </Button>
        ))}
      </aside>

      <div className="o-stack o-stack--section">
        <Card as="article" id="settings-profile" className="c-surface c-surface--stack settings-section-card">
          <h2>Profile</h2>
          {!profilePhotoUrl ? <label>Reference photo</label> : null}
          {profilePhotoUrl ? (
            <button
              type="button"
              className="settings-profile-preview-button"
              onClick={() => setProfilePreviewOpen(true)}
              aria-label="Open full-size profile photo"
              title="View full-size photo"
            >
              <AppImage
                src={profilePhotoUrl}
                alt="Profile reference"
                className="profile-photo-preview"
                width={1200}
                height={1600}
              />
            </button>
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
          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            <Button
              variant="outline"
              onClick={() => uploadProfilePhoto(profilePhotoFile)}
              disabled={!profilePhotoFile || profilePhotoUploading}
            >
              {profilePhotoUploading ? "Uploading..." : "Upload reference photo"}
            </Button>
          </div>
          <label htmlFor="settings-name">Display name</label>
          <p className="subtext">Access level: <strong>{userRole}</strong></p>
          <Input
            id="settings-name"
            value={profileName}
            onChange={(event) => setProfileName(event.target.value)}
            placeholder="Your name"
          />
          <label htmlFor="settings-gender">Gender</label>
          <Select
            value={settingsForm.profile_gender || "unspecified"}
            onValueChange={(value) => {
              if (!value) {
                return;
              }
              setSettingsForm((prev) => ({
                ...prev,
                profile_gender: value === "unspecified" ? "" : value,
              }));
            }}
          >
            <SelectTrigger id="settings-gender" className="w-full">
              <SelectValue placeholder="Select gender">
                {(value) =>
                  GENDER_LABELS[String(value || "unspecified")] || "Select gender"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {Object.entries(GENDER_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label htmlFor="settings-age">Age</label>
          <Input
            id="settings-age"
            type="number"
            min={1}
            max={120}
            value={settingsForm.profile_age}
            onChange={(event) => setSettingsForm((prev) => ({ ...prev, profile_age: event.target.value }))}
            placeholder="Age"
          />
          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            <Button onClick={saveProfile}>Save profile</Button>
          </div>

          <Dialog open={profilePreviewOpen} onOpenChange={setProfilePreviewOpen}>
            <DialogContent className="modal-panel modal-panel-image modal-panel-no-scroll">
              <DialogHeader className="modal-header o-split o-split--start">
                <DialogTitle className="modal-title">Profile photo preview</DialogTitle>
              </DialogHeader>
              <div className="modal-body">
                {profilePhotoUrl ? (
                  <AppImage
                    src={profilePhotoUrl}
                    alt="Full-size profile reference"
                    className="modal-image profile-photo-dialog-image"
                    width={1200}
                    height={1600}
                  />
                ) : (
                  <p className="subtext">Preview unavailable.</p>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </Card>

        <Card as="article" id="settings-features" className="c-surface c-surface--stack settings-section-card">
          <h2>Features</h2>
          <p className="subtext">Turn advanced capabilities on only when they fit the experience you want to offer users.</p>
          <div className="settings-feature-row o-split o-split--start o-split--stack-sm">
            <div>
              <p><strong>Outfit image generation</strong></p>
              <p className="subtext">Generate item thumbnails and composed outfit visuals using your profile reference photo.</p>
            </div>
            <Checkbox
              checked={Boolean(settingsForm.enable_outfit_image_generation)}
              onCheckedChange={(value) =>
                setSettingsForm((prev) => ({ ...prev, enable_outfit_image_generation: Boolean(value) }))
              }
            />
          </div>
          <div className="settings-feature-row o-split o-split--start o-split--stack-sm">
            <div>
              <p><strong>Accessory analysis</strong></p>
              <p className="subtext">Include bags, jewelry, and other accessories during photo analysis.</p>
            </div>
            <Checkbox
              checked={Boolean(settingsForm.enable_accessory_analysis)}
              onCheckedChange={(value) =>
                setSettingsForm((prev) => ({ ...prev, enable_accessory_analysis: Boolean(value) }))
              }
            />
          </div>
          <div className="settings-feature-row o-split o-split--start o-split--stack-sm">
            <div>
              <p><strong>Online store search (Coming soon)</strong></p>
              <p className="subtext">Retail search is temporarily disabled while we finish the storefront integration.</p>
            </div>
            <Checkbox
              checked={false}
              disabled
              aria-label="Online store search coming soon"
            />
          </div>
          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            <Button onClick={saveFeatureSettings}>Save feature settings</Button>
          </div>
        </Card>

        <Card as="article" id="settings-costs" className="c-surface c-surface--stack settings-section-card">
          <h2>Cost usage</h2>
          {costSummaryLoading ? (
            <p className="subtext">Loading cost usage...</p>
          ) : costSummary && (costSummary.analysis_runs || costSummary.custom_outfit_generations || costSummary.try_on_generations || costSummary.estimated_costs_usd?.total) ? (
            <>
              <p className="subtext">Month start: {costSummary.month_start_utc ? new Date(costSummary.month_start_utc).toLocaleString() : "-"}</p>
              <ul className="o-list o-list--split">
                <li>Analysis runs: <strong>{costSummary.analysis_runs ?? 0}</strong></li>
                <li>Custom outfit generations: <strong>{costSummary.custom_outfit_generations ?? 0}</strong></li>
                <li>Try this on generations: <strong>{costSummary.try_on_generations ?? 0}</strong></li>
              </ul>
              <h4>Estimated costs (USD)</h4>
              <ul className="o-list o-list--split">
                <li>Analysis: <strong>${costSummary.estimated_costs_usd?.analysis ?? 0}</strong></li>
                <li>Outfit image generation: <strong>${costSummary.estimated_costs_usd?.outfit_image_generation ?? 0}</strong></li>
                <li>Item image generation: <strong>${costSummary.estimated_costs_usd?.item_image_generation ?? 0}</strong></li>
                <li>Total: <strong>${costSummary.estimated_costs_usd?.total ?? 0}</strong></li>
              </ul>
              <h4>Token estimate</h4>
              <ul className="o-list o-list--split">
                <li>Input tokens: <strong>{costSummary.token_usage_estimate?.total?.input_tokens ?? 0}</strong></li>
                <li>Output tokens: <strong>{costSummary.token_usage_estimate?.total?.output_tokens ?? 0}</strong></li>
                <li>Total tokens: <strong>{costSummary.token_usage_estimate?.total?.total_tokens ?? 0}</strong></li>
              </ul>
            </>
          ) : (
            <p className="subtext">Cost usage unavailable or no usage data yet.</p>
          )}
          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            <Button variant="outline" onClick={() => void refreshCosts()}>Refresh costs</Button>
          </div>
        </Card>

      </div>
    </section>
  );
}




