"use client";

import { useState } from "react";

import { useHistoryContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import BaseButton from "@/components/app/ui/BaseButton";
import BaseDialog from "@/components/app/ui/BaseDialog";

export default function HistoryTab() {
  const { history, historyLoading, historyMessage, refreshHistory } = useHistoryContext();
  const [previewEntry, setPreviewEntry] = useState<(typeof history)[number] | null>(null);

  return (
    <section className="tab-stack">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Archive</span>
          <h2>Analysis history</h2>
          <p className="tab-header-subtext">Review past photo analyses and reopen the source imagery when needed.</p>
        </div>
        <BaseButton variant="ghost" onClick={() => void refreshHistory()} disabled={historyLoading}>
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
                <td data-label="Photo">
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
                        <AppImage
                          className="history-thumb"
                          src={entry.image_url}
                          alt="Analyzed outfit"
                          width={64}
                          height={64}
                        />
                      </BaseButton>
                    ) : (
                      <span className="subtext">No preview</span>
                    )}
                  </div>
                </td>
                <td data-label="Model">{entry.analysis_model || "Unknown"}</td>
                <td data-label="Status">{entry.status || "Unknown"}</td>
                <td data-label="Outfits">{entry.outfit_count ?? 0}</td>
                <td data-label="Created">{entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</td>
                <td data-label="Completed">{entry.completed_at ? new Date(entry.completed_at).toLocaleString() : "-"}</td>
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
            <AppImage
              src={previewEntry.image_url}
              alt="Analyzed outfit preview"
              className="modal-image history-preview-image"
              width={1600}
              height={2000}
            />
          ) : (
            <p className="subtext">Preview unavailable for this photo.</p>
          )}
        </div>
      </BaseDialog>
    </section>
  );
}

