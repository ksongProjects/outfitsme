"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { useSettingsContext, useWardrobeContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import BaseButton from "@/components/app/ui/BaseButton";
import BaseDialog from "@/components/app/ui/BaseDialog";
import BaseInput from "@/components/app/ui/BaseInput";
import BaseSelect from "@/components/app/ui/BaseSelect";
import { formatItemLabel, getItemIcon } from "@/lib/formatters";

const OUTFIT_SOURCE_LABELS: Record<string, string> = {
  photo_analysis: "Photo analysis",
  custom_outfit: "Custom outfit",
  outfitsme_generated: "OutfitsMe generated",
};

export default function OutfitsTab() {
  const { profilePhotoUrl, settingsForm } = useSettingsContext();
  const {
    wardrobe,
    wardrobePage,
    wardrobeHasMore,
    wardrobeLoading,
    wardrobeMessage,
    refreshWardrobe,
    nextWardrobePage,
    prevWardrobePage,
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    generateOutfitsMe,
    outfitMeLoading,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading,
  } = useWardrobeContext();
  const [pendingDelete, setPendingDelete] = useState<(typeof wardrobe)[number] | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");
  const [itemPreview, setItemPreview] = useState<{ image_url: string; name: string } | null>(null);
  const [sourceFilter, setSourceFilter] = useState("all");
  const imageGenerationEnabled = Boolean(settingsForm?.enable_outfit_image_generation);

  const filteredWardrobe = useMemo(
    () => wardrobe.filter((entry) => sourceFilter === "all" || (entry.source_type || "photo_analysis") === sourceFilter),
    [wardrobe, sourceFilter]
  );

  const handleDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const deleted = await deleteWardrobeEntry(pendingDelete.outfit_id);
    if (deleted) {
      setPendingDelete(null);
    }
  };

  const getOutfitDisplayName = (entry: (typeof wardrobe)[number]) => {
    const style = entry.style_label || "Unlabeled";
    if ((entry.outfit_count || 1) > 1) {
      return `${style} (${(entry.outfit_index || 0) + 1})`;
    }
    return style;
  };

  const handleSaveOutfitName = async () => {
    const outfitId = outfitDetails?.selected_outfit?.outfit_id;
    const nextName = editedName.trim();
    if (!outfitId || !nextName) {
      return;
    }
    const saved = await renameOutfit(outfitId, nextName);
    if (saved) {
      setIsEditingName(false);
    }
  };

  const handleGenerateOutfitsMe = async () => {
    const details = outfitDetails || {};
    const selected = details.selected_outfit || null;
    if (!details.photo_id || !selected) {
      return;
    }
    if (!imageGenerationEnabled) {
      toast.error("Outfit image generation is off. Enable it in Settings > Features.");
      return;
    }
    if (!profilePhotoUrl) {
      toast.error("Profile photo is required for OutfitsMe. Upload one in Settings > Profile.");
      return;
    }
    await generateOutfitsMe(details.photo_id, selected.outfit_index);
  };

  return (
    <section className="tab-stack">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Wardrobe</span>
          <h2>My outfits</h2>
          <p className="tab-header-subtext">Browse saved looks, rename strong combinations, and generate try-on previews.</p>
        </div>
        <BaseButton variant="ghost" onClick={() => void refreshWardrobe()} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {wardrobeMessage ? <p className="subtext">{wardrobeMessage}</p> : null}

      <div className="filter-row">
        <BaseSelect
          value={sourceFilter}
          onValueChange={(nextValue) => setSourceFilter(nextValue)}
          options={[
            { value: "all", label: "All outfit types" },
            { value: "photo_analysis", label: "Photo analysis" },
            { value: "custom_outfit", label: "Custom outfit" },
            { value: "outfitsme_generated", label: "OutfitsMe generated" },
          ]}
          placeholder="All outfit types"
        />
        <BaseButton type="button" variant="ghost" onClick={() => setSourceFilter("all")}>
          Clear filters
        </BaseButton>
      </div>

      {wardrobe.length > 0 && filteredWardrobe.length === 0 ? (
        <p className="subtext">No outfits match the selected filter.</p>
      ) : null}

      <div className="table-scroll-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Name</th>
              <th>Created</th>
              <th>Type</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredWardrobe.map((entry) => (
              <tr key={entry.outfit_id} onClick={() => openOutfitDetails(entry.photo_id, entry.outfit_index ?? null)}>
                <td data-label="Photo">
                  {entry.image_url ? (
                    <AppImage
                      src={entry.image_url}
                      alt={getOutfitDisplayName(entry)}
                      className="history-thumb"
                      width={64}
                      height={64}
                    />
                  ) : (
                    <span className="subtext">-</span>
                  )}
                </td>
                <td data-label="Name">{getOutfitDisplayName(entry)}</td>
                <td data-label="Created">{entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</td>
                <td data-label="Type">{OUTFIT_SOURCE_LABELS[entry.source_type || "photo_analysis"] || "Photo analysis"}</td>
                <td data-label="Action">
                  <BaseButton
                    type="button"
                    variant="icon"
                    className="danger-icon-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPendingDelete(entry);
                    }}
                    disabled={deletingOutfitId === entry.outfit_id}
                    aria-label="Delete outfit"
                    title="Delete outfit"
                  >
                    {deletingOutfitId === entry.outfit_id ? "..." : <Trash2 size={16} />}
                  </BaseButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination-row">
        <p className="subtext">Page {wardrobePage}</p>
        <div className="button-row">
          <BaseButton type="button" variant="ghost" onClick={prevWardrobePage} disabled={wardrobeLoading || wardrobePage <= 1}>
            Previous
          </BaseButton>
          <BaseButton type="button" variant="ghost" onClick={nextWardrobePage} disabled={wardrobeLoading || !wardrobeHasMore}>
            Next
          </BaseButton>
        </div>
      </div>

      <BaseDialog
        open={Boolean(outfitDetails || outfitDetailsLoading)}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingName(false);
            closeOutfitDetails();
          }
        }}
        title="Outfit details"
        scrollable={false}
        headerActions={
          !outfitDetailsLoading && outfitDetails?.selected_outfit ? (
            <>
              <BaseButton
                type="button"
                variant="ghost"
                onClick={handleGenerateOutfitsMe}
                disabled={outfitMeLoading || !imageGenerationEnabled}
                title={
                  !imageGenerationEnabled
                    ? "Enable outfit image generation in Settings > Features"
                    : profilePhotoUrl
                      ? "Generate OutfitsMe preview"
                      : "Profile photo required for OutfitsMe"
                }
              >
                {outfitMeLoading ? "OutfitsMe..." : "OutfitsMe"}
              </BaseButton>
              {!isEditingName ? (
                <BaseButton
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditedName(outfitDetails?.selected_outfit?.style || "");
                    setIsEditingName(true);
                  }}
                >
                  Edit
                </BaseButton>
              ) : null}
            </>
          ) : null
        }
      >
        {outfitDetailsLoading ? (
          <p className="subtext">Loading outfit details...</p>
        ) : (
          <div className="outfit-details-layout">
            {outfitDetails?.source_outfit_image_url ? (
              <AppImage
                src={outfitDetails.source_outfit_image_url}
                alt="Source outfit"
                className="modal-image outfit-detail-image"
                width={1600}
                height={2000}
              />
            ) : null}
            {outfitDetails?.image_url ? (
              <AppImage
                src={outfitDetails.image_url}
                alt="Original outfit"
                className="modal-image outfit-detail-image"
                width={1600}
                height={2000}
              />
            ) : (
              <p className="subtext">Original image is unavailable for this outfit.</p>
            )}
            {outfitDetails?.outfitsme_image_url ? (
              <AppImage
                src={outfitDetails.outfitsme_image_url}
                alt="OutfitsMe preview"
                className="modal-image outfit-detail-image"
                width={1600}
                height={2000}
              />
            ) : null}
            <div>
              {outfitDetails?.selected_outfit ? (
                <div className="outfit-group">
                  {isEditingName ? (
                    <>
                      <label htmlFor="outfit-name-input"><strong>Name</strong></label>
                      <BaseInput
                        id="outfit-name-input"
                        value={editedName}
                        onChange={(event) => setEditedName(event.target.value)}
                        placeholder="Outfit name"
                        maxLength={80}
                      />
                      <div className="button-row">
                        <BaseButton
                          type="button"
                          variant="ghost"
                          onClick={() => {
                            setEditedName(outfitDetails.selected_outfit?.style || "");
                            setIsEditingName(false);
                          }}
                          disabled={updatingOutfitId === outfitDetails.selected_outfit.outfit_id}
                        >
                          Cancel
                        </BaseButton>
                        <BaseButton
                          type="button"
                          variant="primary"
                          onClick={handleSaveOutfitName}
                          disabled={!editedName.trim() || updatingOutfitId === outfitDetails.selected_outfit.outfit_id}
                        >
                          {updatingOutfitId === outfitDetails.selected_outfit.outfit_id ? "Saving..." : "Save"}
                        </BaseButton>
                      </div>
                    </>
                  ) : (
                    <p><strong>Name:</strong> {outfitDetails.selected_outfit.style || "Unlabeled"}</p>
                  )}
                  <p>
                    <strong>Type:</strong> {OUTFIT_SOURCE_LABELS[outfitDetails.selected_outfit.source_type || "photo_analysis"] || "Photo analysis"}
                  </p>
                  {(outfitDetails.selected_outfit.items || []).length ? (
                    <ul className="analysis-items">
                      {outfitDetails.selected_outfit.items?.map((item, index) => (
                        <li key={`detail-item-${index}`} className="analysis-item">
                          <span className="wardrobe-item-row">
                            {item.image_url ? (
                              <BaseButton
                                type="button"
                                variant="ghost"
                                className="history-thumb-btn"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setItemPreview({
                                    image_url: item.image_url || "",
                                    name: item.name || "Outfit item",
                                  });
                                }}
                                aria-label="Open item image preview"
                                title="Open item image preview"
                              >
                                <AppImage
                                  src={item.image_url}
                                  alt={item.name || "Outfit item"}
                                  className="item-thumb"
                                  width={48}
                                  height={48}
                                />
                              </BaseButton>
                            ) : null}
                            <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                            <span>{formatItemLabel(item)}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="subtext">No items were stored for this outfit.</p>
                  )}
                </div>
              ) : (
                <p className="subtext">The selected outfit could not be loaded for this photo.</p>
              )}
            </div>
          </div>
        )}
      </BaseDialog>

      <BaseDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
        title="Delete outfit"
        size="sm"
      >
        <p>Remove this outfit from your wardrobe?</p>
        <p className="subtext">Style: <strong>{pendingDelete?.style_label || "Unlabeled"}</strong></p>
        <div className="button-row">
          <BaseButton type="button" variant="ghost" onClick={() => setPendingDelete(null)} disabled={deletingOutfitId === pendingDelete?.outfit_id}>
            Cancel
          </BaseButton>
          <BaseButton type="button" variant="ghost" className="danger-btn" onClick={handleDelete} disabled={deletingOutfitId === pendingDelete?.outfit_id}>
            {deletingOutfitId === pendingDelete?.outfit_id ? "Deleting..." : "Delete"}
          </BaseButton>
        </div>
      </BaseDialog>

      <BaseDialog
        open={Boolean(itemPreview)}
        onOpenChange={(open) => setItemPreview(open ? itemPreview : null)}
        title={itemPreview?.name || "Item preview"}
        size="image"
        scrollable={false}
      >
        {itemPreview?.image_url ? (
          <AppImage
            src={itemPreview.image_url}
            alt={itemPreview.name || "Item preview"}
            className="modal-image item-preview-image"
            width={1600}
            height={2000}
          />
        ) : (
          <p className="subtext">Preview unavailable for this item.</p>
        )}
      </BaseDialog>
    </section>
  );
}

