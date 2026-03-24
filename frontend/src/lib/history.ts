import type { HistoryEntry } from "@/lib/types";

const HISTORY_JOB_TYPE_LABELS: Record<string, string> = {
  analysis: "Photo analysis",
  photo_analysis: "Photo analysis",
  custom_outfit: "Custom outfit",
  try_on: "Try this on",
  outfitsme_generated: "Try this on",
};

export function getHistoryJobTypeLabel(jobType?: string) {
  const normalized = String(jobType || "")
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, "_");

  return HISTORY_JOB_TYPE_LABELS[normalized] || "Unknown AI job";
}

export function isHistoryEntrySuccessful(entry: HistoryEntry) {
  const normalizedStatus = String(entry.status || "").trim().toLowerCase();
  return normalizedStatus === "completed" || normalizedStatus === "succeeded";
}
