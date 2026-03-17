"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Trash2, Wand2, XIcon } from "lucide-react";
import { toast } from "sonner";

import { useSettingsContext, useWardrobeContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatItemLabel, getItemIcon } from "@/lib/formatters";

const OUTFIT_SOURCE_LABELS: Record<string, string> = {
  photo_analysis: "Photo analysis",
  custom_outfit: "Custom outfit",
  outfitsme_generated: "OutfitsMe generated",
};

const getItemDetailDescription = (item: {
  description?: string;
  material?: string;
  pattern?: string;
  fit?: string;
  silhouette?: string;
  length?: string;
  details?: string;
}) => {
  const savedDescription = String(item.description || "").trim();
  if (savedDescription) {
    return savedDescription;
  }

  const detailParts = [
    item.material,
    item.pattern,
    item.fit,
    item.silhouette,
    item.length,
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  const detailSummary = detailParts.join(", ");
  const extraDetails = String(item.details || "").trim();
  if (detailSummary && extraDetails) {
    return `${detailSummary}; ${extraDetails}`;
  }
  return detailSummary || extraDetails;
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
  const [pendingGeneratedPreview, setPendingGeneratedPreview] = useState<{
    photoId: string;
    outfitIndex: number | null;
  } | null>(null);
  const [downloadingImage, setDownloadingImage] = useState(false);
  const [sourceFilter, setSourceFilter] = useState("all");
  const imageGenerationEnabled = Boolean(settingsForm?.enable_outfit_image_generation);
  const selectedOutfitSourceType = String(outfitDetails?.selected_outfit?.source_type || "").trim().toLowerCase();
  const primaryDetailImageLabel =
    selectedOutfitSourceType === "custom_outfit"
      ? "Generated outfit preview"
      : selectedOutfitSourceType === "outfitsme_generated"
        ? "Try-on preview"
        : "Original outfit";

  const filteredWardrobe = useMemo(
    () => wardrobe.filter((entry) => sourceFilter === "all" || (entry.source_type || "photo_analysis") === sourceFilter),
    [wardrobe, sourceFilter]
  );
  const hasFilteredWardrobe = filteredWardrobe.length > 0;
  const shouldShowEmptyState = !wardrobeLoading && !hasFilteredWardrobe;
  const emptyStateMessage = wardrobe.length === 0
    ? wardrobeMessage || "No wardrobe entries yet. Analyze your first outfit photo."
    : sourceFilter !== "all"
      ? "No outfits match the selected filter."
      : "No outfits are available on this page.";
  const outfitCountsByPhoto = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of wardrobe) {
      const photoId = entry.photo_id || "";
      if (!photoId) {
        continue;
      }
      counts.set(photoId, (counts.get(photoId) || 0) + 1);
    }
    return counts;
  }, [wardrobe]);

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
    if ((outfitCountsByPhoto.get(entry.photo_id || "") || 1) > 1) {
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

  useEffect(() => {
    if (!pendingGeneratedPreview || outfitDetails || outfitDetailsLoading) {
      return;
    }

    const timer = window.setTimeout(() => {
      openOutfitDetails(
        pendingGeneratedPreview.photoId,
        pendingGeneratedPreview.outfitIndex
      );
      setPendingGeneratedPreview(null);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [
    closeOutfitDetails,
    openOutfitDetails,
    outfitDetails,
    outfitDetailsLoading,
    pendingGeneratedPreview,
  ]);

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
    const result = await generateOutfitsMe(details.photo_id, selected.outfit_index);
    const savedOutfit =
      result && typeof result === "object" && "saved_outfit" in result
        ? result.saved_outfit
        : null;
    const generatedPhotoId = String(savedOutfit?.photo_id || "").trim();
    if (!generatedPhotoId) {
      return;
    }

    setIsEditingName(false);
    setPendingGeneratedPreview({
      photoId: generatedPhotoId,
      outfitIndex:
        typeof savedOutfit?.outfit_index === "number"
          ? savedOutfit.outfit_index
          : null,
    });
    closeOutfitDetails();
  };

  const handleDownloadOutfitImage = async () => {
    const primaryImageUrl =
      String(outfitDetails?.outfitsme_image_url || "").trim() ||
      String(outfitDetails?.image_url || "").trim() ||
      String(outfitDetails?.source_outfit_image_url || "").trim();

    if (!primaryImageUrl) {
      toast.error("No downloadable image is available for this outfit.");
      return;
    }

    setDownloadingImage(true);
    try {
      const response = await fetch(primaryImageUrl);
      if (!response.ok) {
        throw new Error("Failed to download image.");
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const styleLabel = String(outfitDetails?.selected_outfit?.style || "outfit").trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "outfit";
      const extension =
        blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";

      anchor.href = blobUrl;
      anchor.download = `${styleLabel}.${extension}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error((error as Error).message || "Failed to download image.");
    } finally {
      setDownloadingImage(false);
    }
  };

  return (
    <section className="o-stack o-stack--section">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Wardrobe</span>
          <h2>My outfits</h2>
          <p className="tab-header-subtext">Browse saved looks, rename strong combinations, and generate try-on previews.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshWardrobe()} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {wardrobeMessage && hasFilteredWardrobe ? <p className="subtext">{wardrobeMessage}</p> : null}

      <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
        <Select
          value={sourceFilter}
          onValueChange={(nextValue) => {
            if (!nextValue) {
              return;
            }
            setSourceFilter(nextValue);
          }}
        >
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All outfit types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outfit types</SelectItem>
            <SelectItem value="photo_analysis">Photo analysis</SelectItem>
            <SelectItem value="custom_outfit">Custom outfit</SelectItem>
            <SelectItem value="outfitsme_generated">OutfitsMe generated</SelectItem>
          </SelectContent>
        </Select>
        <Button type="button" variant="outline" onClick={() => setSourceFilter("all")}>
          Clear filters
        </Button>
      </div>

      {shouldShowEmptyState ? (
        <div className="table-empty-state" role="status" aria-live="polite">
          <p className="subtext">{emptyStateMessage}</p>
        </div>
      ) : (
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
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPendingDelete(entry);
                      }}
                      disabled={deletingOutfitId === entry.outfit_id}
                      aria-label="Delete outfit"
                      title="Delete outfit"
                    >
                      {deletingOutfitId === entry.outfit_id ? "..." : <Trash2 size={16} />}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="o-cluster o-cluster--between o-cluster--wrap o-cluster--stack-sm">
        <p className="subtext">Page {wardrobePage}</p>
        <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
          <Button type="button" variant="outline" onClick={prevWardrobePage} disabled={wardrobeLoading || wardrobePage <= 1}>
            Previous
          </Button>
          <Button type="button" variant="outline" onClick={nextWardrobePage} disabled={wardrobeLoading || !wardrobeHasMore}>
            Next
          </Button>
        </div>
      </div>

      <Dialog
        open={Boolean(outfitDetails || outfitDetailsLoading)}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingName(false);
            closeOutfitDetails();
          }
        }}
      >
        <DialogContent className="modal-panel modal-panel-image outfit-detail-modal" showCloseButton={false}>
          <DialogHeader className="modal-header outfit-detail-header">
            <div className="o-split o-split--start outfit-detail-header-row">
              <DialogTitle className="modal-title">Outfit details</DialogTitle>
              <DialogClose
                aria-label="Close outfit details"
                title="Close outfit details"
                render={<Button type="button" variant="ghost" size="icon-sm" />}
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </DialogClose>
            </div>
            {!outfitDetailsLoading && outfitDetails?.selected_outfit ? (
              <div className="modal-header-actions o-cluster o-cluster--wrap o-cluster--stack-sm outfit-detail-header-actions">
                {selectedOutfitSourceType === "photo_analysis" ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGenerateOutfitsMe}
                    disabled={outfitMeLoading || !imageGenerationEnabled}
                    title={
                      !imageGenerationEnabled
                        ? "Enable outfit image generation in Settings > Features"
                        : profilePhotoUrl
                          ? "Generate a try-on preview"
                          : "Profile photo required for try-on previews"
                    }
                  >
                    {outfitMeLoading ? (
                      <>
                        <Spinner />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 size={16} />
                        Try it on
                      </>
                    )}
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleDownloadOutfitImage}
                  disabled={downloadingImage}
                  title="Download the current outfit image"
                >
                  {downloadingImage ? (
                    <>
                      <Spinner />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download size={16} />
                      Download image
                    </>
                  )}
                </Button>
                {!isEditingName ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setEditedName(outfitDetails?.selected_outfit?.style || "");
                      setIsEditingName(true);
                    }}
                  >
                    Edit
                  </Button>
                ) : null}
              </div>
            ) : null}
          </DialogHeader>
          <div className="modal-body">
            {outfitDetailsLoading ? (
              <p className="subtext">Loading outfit details...</p>
            ) : (
              <div className="o-detail-layout o-detail-layout--stack-sm">
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
                    alt={primaryDetailImageLabel}
                    className="modal-image outfit-detail-image"
                    width={1600}
                    height={2000}
                  />
                ) : (
                  <p className="subtext">{primaryDetailImageLabel} is unavailable for this outfit.</p>
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
                <div className="outfit-detail-panel">
                  {outfitDetails?.selected_outfit ? (
                    <div className="outfit-detail-content o-stack o-stack--tight">
                      {isEditingName ? (
                        <>
                          <label htmlFor="outfit-name-input"><strong>Name</strong></label>
                          <Input
                            id="outfit-name-input"
                            value={editedName}
                            onChange={(event) => setEditedName(event.target.value)}
                            placeholder="Outfit name"
                            maxLength={80}
                          />
                          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm outfit-detail-actions">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => {
                                setEditedName(outfitDetails.selected_outfit?.style || "");
                                setIsEditingName(false);
                              }}
                              disabled={updatingOutfitId === outfitDetails.selected_outfit.outfit_id}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={handleSaveOutfitName}
                              disabled={!editedName.trim() || updatingOutfitId === outfitDetails.selected_outfit.outfit_id}
                            >
                              {updatingOutfitId === outfitDetails.selected_outfit.outfit_id ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </>
                      ) : (
                        <p className="outfit-detail-field"><strong>Name:</strong> {outfitDetails.selected_outfit.style || "Unlabeled"}</p>
                      )}
                      <p className="outfit-detail-field">
                        <strong>Type:</strong> {OUTFIT_SOURCE_LABELS[outfitDetails.selected_outfit.source_type || "photo_analysis"] || "Photo analysis"}
                      </p>
                      {(outfitDetails.selected_outfit.items || []).length ? (
                        <ul className="o-list outfit-detail-items">
                          {outfitDetails.selected_outfit.items?.map((item, index) => {
                            const itemDescription = getItemDetailDescription(item);
                            return (
                              <li key={`detail-item-${index}`} className="analysis-item outfit-detail-item">
                                <span className="o-media outfit-detail-item-media">
                                  {item.image_url ? (
                                    <Button
                                      type="button"
                                      variant="outline"
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
                                    </Button>
                                  ) : null}
                                  <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                                  <span className="analysis-item-copy">
                                    <span>{formatItemLabel(item)}</span>
                                    {itemDescription ? (
                                      <span className="subtext">{itemDescription}</span>
                                    ) : null}
                                  </span>
                                </span>
                              </li>
                            );
                          })}
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
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null);
          }
        }}
      >
        <DialogContent className="modal-panel modal-panel-sm">
          <DialogHeader className="modal-header o-split o-split--start">
            <DialogTitle className="modal-title">Delete outfit</DialogTitle>
          </DialogHeader>
          <div className="modal-body">
            <p>Remove this outfit from your wardrobe?</p>
            <p className="subtext">Style: <strong>{pendingDelete?.style_label || "Unlabeled"}</strong></p>
            <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
              <Button type="button" variant="outline" onClick={() => setPendingDelete(null)} disabled={deletingOutfitId === pendingDelete?.outfit_id}>
                Cancel
              </Button>
              <Button type="button" variant="destructive" onClick={handleDelete} disabled={deletingOutfitId === pendingDelete?.outfit_id}>
                {deletingOutfitId === pendingDelete?.outfit_id ? "Deleting..." : "Delete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(itemPreview)}
        onOpenChange={(open) => setItemPreview(open ? itemPreview : null)}
      >
        <DialogContent className="modal-panel modal-panel-image modal-panel-no-scroll">
          <DialogHeader className="modal-header o-split o-split--start">
            <DialogTitle className="modal-title">{itemPreview?.name || "Item preview"}</DialogTitle>
          </DialogHeader>
          <div className="modal-body">
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
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
