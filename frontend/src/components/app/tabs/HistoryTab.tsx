"use client";

import { useState } from "react";

import { useHistoryContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getHistoryJobTypeLabel } from "@/lib/history";

export default function HistoryTab() {
  const {
    history,
    historyLoading,
    historyMessage,
    refreshHistory,
    historyPage,
    historyPageSize,
    historyTotalItems,
    historyTotalPages,
    setHistoryPage,
    setHistoryPageSize,
  } = useHistoryContext();
  const [previewEntry, setPreviewEntry] = useState<(typeof history)[number] | null>(null);
  const hasHistory = history.length > 0;
  const shouldShowEmptyState = !historyLoading && !hasHistory;

  return (
    <section className="o-stack o-stack--section">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Archive</span>
          <h2>AI job history</h2>
          <p className="tab-header-subtext">Review past photo analysis, custom outfit, and try-on jobs and reopen the related imagery when needed.</p>
        </div>
        <Button variant="outline" onClick={() => void refreshHistory()} disabled={historyLoading}>
          {historyLoading ? "Loading..." : "Refresh"}
        </Button>
      </div>

      {historyMessage && hasHistory ? <p className="subtext">{historyMessage}</p> : null}

      {shouldShowEmptyState ? (
        <div className="table-empty-state" role="status" aria-live="polite">
          <p className="subtext">{historyMessage || "Analyze a photo to populate this table."}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Photo</TableHead>
                <TableHead>AI job</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map((entry) => (
                <TableRow key={entry.job_id}>
                  <TableCell data-label="Photo">
                    <div className="o-media o-media--stack-sm">
                      {entry.image_url ? (
                        <Button
                          type="button"
                          variant="outline"
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
                        </Button>
                      ) : (
                        <span className="subtext">No preview</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell data-label="AI job">{getHistoryJobTypeLabel(entry.job_type)}</TableCell>
                  <TableCell data-label="Status">{entry.status || "Unknown"}</TableCell>
                  <TableCell data-label="Created">{entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}</TableCell>
                  <TableCell data-label="Completed">{entry.completed_at ? new Date(entry.completed_at).toLocaleString() : "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Pagination
            currentPage={historyPage}
            totalPages={historyTotalPages}
            totalItems={historyTotalItems}
            pageSize={historyPageSize}
            onPageChange={setHistoryPage}
            onPageSizeChange={setHistoryPageSize}
          />
        </div>
      )}

      <Dialog open={Boolean(previewEntry)} onOpenChange={(open) => setPreviewEntry(open ? previewEntry : null)}>
        <DialogContent className="modal-panel modal-panel-image modal-panel-no-scroll">
          <DialogHeader className="modal-header o-split o-split--start">
            <DialogTitle className="modal-title">Analysis photo preview</DialogTitle>
          </DialogHeader>
          <div className="modal-body history-preview-body">
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
        </DialogContent>
      </Dialog>
    </section>
  );
}



