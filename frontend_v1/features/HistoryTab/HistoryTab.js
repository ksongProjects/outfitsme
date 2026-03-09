import { useState } from "react";

import { useHistoryContext } from "../../context/DashboardContext";
import BaseButton from "../../components/ui/BaseButton";
import BaseDialog from "../../components/ui/BaseDialog";

export default function HistoryTab() {
  const {
    history,
    historyLoading,
    historyMessage,
    loadHistory
  } = useHistoryContext();
  const [previewEntry, setPreviewEntry] = useState(null);

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Analysis history</h2>
          <p className="tab-header-subtext">Review past photo analyses and remove stored photos.</p>
        </div>
        <BaseButton variant="ghost" onClick={() => loadHistory(true)} disabled={historyLoading}>
          {historyLoading ? "Loading..." : "Refresh"}
        </BaseButton>
      </div>

      {historyMessage ? <p className="subtext">{historyMessage}</p> : null}

      <div className="table-scroll-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Photo</th>
              <th>Model</th>
              <th>Status</th>
              <th>Outfits</th>
              <th>Created</th>
              <th>Completed</th>
            </tr>
          </thead>
          <tbody>
            {history.map((entry) => (
              <tr key={entry.job_id}>
                <td>
                  <div className="history-photo-cell">
                    {entry.image_url ? (
                      <BaseButton
                        type="button"
                        variant="ghost"
                        className="history-thumb-btn"
                        onClick={() => setPreviewEntry(entry)}
                        aria-label="Open photo preview"
                        title="Open photo preview"
                      >
                        <img className="history-thumb" src={entry.image_url} alt="Analyzed outfit" />
                      </BaseButton>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BaseDialog
        open={Boolean(previewEntry)}
        onOpenChange={(open) => setPreviewEntry(open ? previewEntry : null)}
        title="Analysis photo preview"
        scrollable={false}
        size="image"
      >
        <div className="history-preview-body">
          {previewEntry?.image_url ? (
            <img src={previewEntry.image_url} alt="Analyzed outfit preview" className="modal-image history-preview-image" />
          ) : (
            <p className="subtext">Preview unavailable for this photo.</p>
          )}
        </div>
      </BaseDialog>
    </section>
  );
}
