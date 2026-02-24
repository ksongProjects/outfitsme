import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useSettingsContext, useWardrobeContext } from "../../context/DashboardContext";
import BaseButton from "../ui/BaseButton";
import BaseDialog from "../ui/BaseDialog";
import BaseInput from "../ui/BaseInput";

export default function OutfitsTab() {
  const { profilePhotoUrl } = useSettingsContext();
  const {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    deletingOutfitId,
    renameOutfit,
    updatingOutfitId,
    generateOutfitMe,
    outfitMeLoading,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading
  } = useWardrobeContext();
  const [pendingDelete, setPendingDelete] = useState(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState("");

  useEffect(() => {
    const selectedStyle = outfitDetails?.selected_outfit?.style || "";
    setEditedName(selectedStyle);
    setIsEditingName(false);
  }, [outfitDetails?.selected_outfit?.outfit_id, outfitDetails?.selected_outfit?.style]);

  const handleDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const deleted = await deleteWardrobeEntry(pendingDelete.outfit_id);
    if (deleted) {
      setPendingDelete(null);
    }
  };

  const getOutfitDisplayName = (entry) => {
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

  const handleGenerateOutfitMe = async () => {
    const details = outfitDetails || {};
    const selected = details.selected_outfit || null;
    if (!details.photo_id || !selected) {
      return;
    }
    if (!profilePhotoUrl) {
      toast.error("Profile photo is required for OutfitMe. Upload one in Settings > Profile.");
      return;
    }
    await generateOutfitMe(details.photo_id, selected.outfit_index);
  };

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>My Outfits</h2>
          <p className="tab-header-subtext">Browse saved looks and open outfit details.</p>
        </div>
        <BaseButton variant="ghost" onClick={loadWardrobe} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {wardrobeMessage ? <p className="subtext">{wardrobeMessage}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Style</th>
            <th>Items</th>
            <th>Created</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {wardrobe.map((entry) => (
            <tr key={entry.row_id || `${entry.photo_id}:${entry.outfit_index || 0}`}>
              <td>
                <BaseButton
                  type="button"
                  variant="link"
                  onClick={() => openOutfitDetails(entry.photo_id, entry.outfit_index)}
                >
                  {getOutfitDisplayName(entry)}
                </BaseButton>
              </td>
              <td>
                {entry.style_label || "Unlabeled"}
              </td>
              <td>{entry.outfit_items_count ?? "-"}</td>
              <td>{new Date(entry.created_at).toLocaleString()}</td>
              <td>
                <BaseButton
                  type="button"
                  variant="icon"
                  className="danger-icon-btn"
                  onClick={() => setPendingDelete(entry)}
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

      <BaseDialog
        open={Boolean(outfitDetails || outfitDetailsLoading)}
        onOpenChange={(open) => {
          if (!open) {
            setIsEditingName(false);
            closeOutfitDetails();
          }
        }}
        title="Outfit details"
        headerActions={
          !outfitDetailsLoading && outfitDetails?.selected_outfit ? (
            <>
              <BaseButton
                type="button"
                variant="ghost"
                onClick={handleGenerateOutfitMe}
                disabled={outfitMeLoading}
                title={profilePhotoUrl ? "Generate OutfitMe preview" : "Profile photo required for OutfitMe"}
              >
                {outfitMeLoading ? "OutfitMe..." : "OutfitMe"}
              </BaseButton>
              {!isEditingName ? (
                <BaseButton
                  type="button"
                  variant="ghost"
                  onClick={() => setIsEditingName(true)}
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
            {outfitDetails?.image_url ? (
              <img src={outfitDetails.image_url} alt="Original outfit" className="modal-image" />
            ) : (
              <p className="subtext">Original image is unavailable for this outfit.</p>
            )}
            {outfitDetails?.outfitme_image_url ? (
              <img src={outfitDetails.outfitme_image_url} alt="OutfitMe preview" className="modal-image" />
            ) : null}
            <div>
              <h4>
                Outfit {(outfitDetails?.selected_outfit?.outfit_index ?? 0) + 1}
              </h4>
              {outfitDetails?.selected_outfit ? (
                <div className="outfit-group">
                  {isEditingName ? (
                    <>
                      <label htmlFor="outfit-name-input"><strong>Name:</strong></label>
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
                            setEditedName(outfitDetails.selected_outfit.style || "");
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
                          disabled={
                            !editedName.trim()
                            || updatingOutfitId === outfitDetails.selected_outfit.outfit_id
                          }
                        >
                          {updatingOutfitId === outfitDetails.selected_outfit.outfit_id ? "Saving..." : "Save"}
                        </BaseButton>
                      </div>
                    </>
                  ) : (
                    <p>
                      <strong>Name:</strong> {outfitDetails.selected_outfit.style || "Unlabeled"}
                    </p>
                  )}
                  {(outfitDetails.selected_outfit.items || []).length ? (
                    <ul className="analysis-items">
                      {outfitDetails.selected_outfit.items.map((item, index) => (
                        <li key={`detail-item-${outfitDetails.selected_outfit.outfit_index}-${index}`} className="analysis-item">
                          <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                          <span>{formatItemLabel(item)}</span>
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
        <p className="subtext">
          Style: <strong>{pendingDelete?.style_label || "Unlabeled"}</strong>
        </p>
        <div className="button-row">
          <BaseButton
            type="button"
            variant="ghost"
            onClick={() => setPendingDelete(null)}
            disabled={deletingOutfitId === pendingDelete?.outfit_id}
          >
            Cancel
          </BaseButton>
          <BaseButton
            type="button"
            variant="ghost"
            className="danger-btn"
            onClick={handleDelete}
            disabled={deletingOutfitId === pendingDelete?.outfit_id}
          >
            {deletingOutfitId === pendingDelete?.outfit_id ? "Deleting..." : "Delete"}
          </BaseButton>
        </div>
      </BaseDialog>
    </section>
  );
}
