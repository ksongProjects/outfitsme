import { useState } from "react";
import { Trash2 } from "lucide-react";

import { useHistoryContext } from "../../context/DashboardContext";

export default function HistoryTab() {
  const {
    history,
    historyLoading,
    historyMessage,
    loadHistory,
    deleteHistoryPhoto,
    deletingPhotoId
  } = useHistoryContext();
  const [pendingDelete, setPendingDelete] = useState(null);

  const handleDelete = async () => {
    if (!pendingDelete?.photo_id) {
      return;
    }
    const deleted = await deleteHistoryPhoto(pendingDelete.photo_id);
    if (deleted) {
      setPendingDelete(null);
    }
  };

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Analysis history</h2>
          <p className="tab-header-subtext">Review past photo analyses and remove stored photos.</p>
        </div>
        <button className="ghost-btn" onClick={loadHistory} disabled={historyLoading}>
          {historyLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {historyMessage ? <p className="subtext">{historyMessage}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>Photo</th>
            <th>Model</th>
            <th>Status</th>
            <th>Outfits</th>
            <th>Created</th>
            <th>Completed</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {history.map((entry) => (
            <tr key={entry.job_id}>
              <td>
                <div className="history-photo-cell">
                  {entry.image_url ? (
                    <img className="history-thumb" src={entry.image_url} alt="Analyzed outfit" />
                  ) : (
                    <span className="subtext">No preview</span>
                  )}
                </div>
              </td>
              <td>{entry.analysis_model || "Unknown"}</td>
              <td>{entry.status || "Unknown"}</td>
              <td>{entry.outfit_count ?? 0}</td>
              <td>{entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</td>
              <td>{entry.completed_at ? new Date(entry.completed_at).toLocaleString() : "-"}</td>
              <td>
                <button
                  type="button"
                  className="icon-btn danger-icon-btn"
                  onClick={() => setPendingDelete(entry)}
                  disabled={deletingPhotoId === entry.photo_id}
                  aria-label="Delete photo"
                  title="Delete photo and related outfits"
                >
                  {deletingPhotoId === entry.photo_id ? "..." : <Trash2 size={16} />}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pendingDelete ? (
        <div className="modal-backdrop" onClick={() => setPendingDelete(null)}>
          <div className="modal-panel modal-panel-sm" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete photo history</h3>
              <button type="button" className="ghost-btn" onClick={() => setPendingDelete(null)}>Close</button>
            </div>
            <p>Remove this photo from history?</p>
            <p className="danger-note" role="alert">
              Warning: this will also delete {pendingDelete.outfit_count ?? 0} outfit
              {(pendingDelete.outfit_count ?? 0) === 1 ? "" : "s"} and related items generated from this photo.
              This action cannot be undone.
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
