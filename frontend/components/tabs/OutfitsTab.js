import { useState } from "react";

import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useWardrobeContext } from "../../context/DashboardContext";

export default function OutfitsTab() {
  const {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    deletingPhotoId,
    openOutfitDetails,
    closeOutfitDetails,
    outfitDetails,
    outfitDetailsLoading
  } = useWardrobeContext();
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const deleted = await deleteWardrobeEntry(pendingDelete.photo_id);
    if (deleted) {
      setPendingDelete(null);
    }
  };

  const getOutfitDisplayName = (entry) => {
    const style = entry.style_label || "Unlabeled";
    if ((entry.outfit_count || 1) > 1) {
      return `${style} - Outfit ${(entry.outfit_index || 0) + 1}`;
    }
    return `${style} - Outfit`;
  };

  return (
    <section>
      <div className="toolbar-row">
        <h2>Your outfits</h2>
        <button className="ghost-btn" onClick={loadWardrobe} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </button>
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
              <td>{getOutfitDisplayName(entry)}</td>
              <td>{entry.style_label || "Unlabeled"}</td>
              <td>{entry.outfit_items_count ?? "-"}</td>
              <td>{new Date(entry.created_at).toLocaleString()}</td>
              <td>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => openOutfitDetails(entry.photo_id, entry.outfit_index)}
                >
                  View details
                </button>
                <button
                  type="button"
                  className="ghost-btn danger-btn"
                  onClick={() => setPendingDelete(entry)}
                  disabled={deletingPhotoId === entry.photo_id}
                >
                  {deletingPhotoId === entry.photo_id ? "Deleting..." : "Delete"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {outfitDetails || outfitDetailsLoading ? (
        <div className="modal-backdrop" onClick={closeOutfitDetails}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Outfit details</h3>
              <button type="button" className="ghost-btn" onClick={closeOutfitDetails}>Close</button>
            </div>
            {outfitDetailsLoading ? (
              <p className="subtext">Loading outfit details...</p>
            ) : (
              <div className="outfit-details-layout">
                {outfitDetails?.image_url ? (
                  <img src={outfitDetails.image_url} alt="Original outfit" className="modal-image" />
                ) : (
                  <p className="subtext">Original image is unavailable for this outfit.</p>
                )}
                <div>
                  <h4>
                    Outfit {(outfitDetails?.selected_outfit?.outfit_index ?? 0) + 1}
                  </h4>
                  {outfitDetails?.selected_outfit ? (
                    <div className="outfit-group">
                      <p>
                        <strong>Style:</strong> {outfitDetails.selected_outfit.style || "Unlabeled"}
                      </p>
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
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="modal-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="modal-panel modal-panel-sm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete outfit</h3>
              <button type="button" className="ghost-btn" onClick={() => setPendingDelete(null)}>Close</button>
            </div>
            <p>Remove this outfit from your wardrobe?</p>
            <p className="subtext">
              Style: <strong>{pendingDelete.style_label || "Unlabeled"}</strong>
            </p>
            <div className="button-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={() => setPendingDelete(null)}
                disabled={deletingPhotoId === pendingDelete.photo_id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ghost-btn danger-btn"
                onClick={handleDelete}
                disabled={deletingPhotoId === pendingDelete.photo_id}
              >
                {deletingPhotoId === pendingDelete.photo_id ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
