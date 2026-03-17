"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Wand2 } from "lucide-react";
import { toast } from "sonner";

import HistoryTab from "@/components/app/tabs/HistoryTab";
import { useAnalysisContext, useSettingsContext, useWardrobeContext } from "@/components/app/DashboardContext";
import AppImage from "@/components/app/ui/AppImage";
import ImageUploadField from "@/components/app/ui/ImageUploadField";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatItemLabel, getItemIcon } from "@/lib/formatters";

export default function AnalyzeTab() {
  const [interaction, setInteraction] = useState<{
    mode: "draw" | "move" | "resize";
    pointerId: number;
    startPoint: { x: number; y: number };
    startCrop: { x: number; y: number; width: number; height: number } | null;
    handle: "nw" | "ne" | "sw" | "se" | null;
  } | null>(null);
  const [outfitMePreviewState, setOutfitsMePreviewState] = useState<Record<string, string>>({});
  const [expandedAnalysisKeys, setExpandedAnalysisKeys] = useState<Record<string, boolean>>({});
  const [itemPreview, setItemPreview] = useState<{ image_url: string; name: string } | null>(null);
  const {
    previewUrl,
    onFileDrop,
    fileName,
    clearSelectedFile,
    cropArea,
    setCropArea,
    runAnalysis,
    disabled,
    loading,
    completedAnalyses,
    selectedModel,
    setSelectedModel,
    modelOptions,
    jobStatus,
    activeAnalysisCount,
    maxConcurrentAnalysisJobs,
    analysisLimits,
    limitsLoading,
    error,
    info,
  } = useAnalysisContext();
  const { profilePhotoUrl, settingsForm } = useSettingsContext();
  const { generateOutfitsMe, outfitMeLoading } = useWardrobeContext();
  const dailyLimit = analysisLimits?.daily_limit ?? 0;
  const usedToday = analysisLimits?.used_today ?? 0;
  const remainingToday = analysisLimits?.remaining_today;
  const trialActive = Boolean(analysisLimits?.trial_active);
  const trialDaysRemaining = analysisLimits?.trial_days_remaining ?? 0;
  const accessMode = analysisLimits?.access_mode || "trial";
  const userRole = analysisLimits?.user_role || "trial";
  const progress = jobStatus?.progress || null;
  const progressCounts = progress?.counts || null;
  const progressCurrentItem = progress?.current_item || null;
  const availableImageModel = (modelOptions || []).find((model) => model.supports_image && model.available);
  const firstUnavailableImageModel = (modelOptions || []).find((model) => model.supports_image && !model.available);
  const imageGenerationEnabled = Boolean(settingsForm?.enable_outfit_image_generation);
  const stageLabelByKey: Record<string, string> = {
    submitting: "Submitting request",
    queued: "Queued for processing",
    processing_started: "Processing started",
    loading_photo: "Loading photo",
    photo_processed: "Photo loaded",
    analyzing_photo: "Running model",
    persisting_results: "Saving results",
    generating_item_images: "Generating item images",
    completed: "Completed",
    failed: "Failed",
  };
  const queueSummaryText =
    activeAnalysisCount > 1
      ? `You have ${activeAnalysisCount} analysis jobs in progress. The latest job status is shown below.`
      : "";
  const statusLabel = stageLabelByKey[jobStatus?.status || ""] || jobStatus?.status || "Pending";
  const stageLabel = stageLabelByKey[progress?.stage || ""] || progress?.stage || "";
  const analysisInProgress = loading || ["queued", "processing_started", "submitting"].includes(jobStatus?.status || "");
  const shouldCollapseResults = activeAnalysisCount > 1;
  const [resultsExpanded, setResultsExpanded] = useState(true);

  useEffect(() => {
    setResultsExpanded(activeAnalysisCount <= 1);
  }, [activeAnalysisCount]);

  useEffect(() => {
    const latestEntry = completedAnalyses[0];
    if (!latestEntry) {
      return;
    }

    const latestKey = String(latestEntry.job_id || latestEntry.result.photo_id || "latest-analysis");
    setExpandedAnalysisKeys((current) => (
      latestKey in current ? current : { ...current, [latestKey]: true }
    ));
  }, [completedAnalyses]);

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const minCropSize = 0.01;
  const hasGenerationAccess = accessMode === "unlimited" || trialActive;

  const buildAnalysisKey = (
    jobId: string | null | undefined,
    photoId: string | undefined,
    index: number
  ) => String(jobId || photoId || `analysis-${index}`);

  const buildOutfitsMePreviewKey = (
    photoId: string | null | undefined,
    outfitIndex: number
  ) => `${String(photoId || "unknown-photo")}:${outfitIndex}`;

  const formatCompletedAt = (value: string | null | undefined) => {
    if (!value) {
      return "Recently completed";
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return "Recently completed";
    }
    return parsed.toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  const getRelativePoint = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return null;
    }
    const x = clamp01((event.clientX - bounds.left) / bounds.width);
    const y = clamp01((event.clientY - bounds.top) / bounds.height);
    return { x, y };
  };

  const isPointInsideCrop = (
    point: { x: number; y: number } | null,
    crop: typeof cropArea
  ) => {
    if (!point || !crop) {
      return false;
    }
    return (
      point.x >= crop.x &&
      point.x <= crop.x + crop.width &&
      point.y >= crop.y &&
      point.y <= crop.y + crop.height
    );
  };

  const normalizeRect = (ax: number, ay: number, bx: number, by: number) => {
    const x = clamp01(Math.min(ax, bx));
    const y = clamp01(Math.min(ay, by));
    const right = clamp01(Math.max(ax, bx));
    const bottom = clamp01(Math.max(ay, by));
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y),
    };
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const resizeHandle = (event.target as HTMLElement | null)?.dataset?.handle as
      | "nw"
      | "ne"
      | "sw"
      | "se"
      | undefined;
    if (resizeHandle && cropArea) {
      setInteraction({
        mode: "resize",
        pointerId: event.pointerId,
        startPoint: point,
        startCrop: cropArea,
        handle: resizeHandle,
      });
      return;
    }

    if (cropArea && isPointInsideCrop(point, cropArea)) {
      setInteraction({
        mode: "move",
        pointerId: event.pointerId,
        startPoint: point,
        startCrop: cropArea,
        handle: null,
      });
      return;
    }

    setInteraction({
      mode: "draw",
      pointerId: event.pointerId,
      startPoint: point,
      startCrop: null,
      handle: null,
    });
    setCropArea({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }
    if (interaction.mode === "draw") {
      setCropArea(normalizeRect(interaction.startPoint.x, interaction.startPoint.y, point.x, point.y));
      return;
    }

    if (interaction.mode === "move" && interaction.startCrop) {
      const deltaX = point.x - interaction.startPoint.x;
      const deltaY = point.y - interaction.startPoint.y;
      setCropArea({
        x: Math.min(Math.max(0, interaction.startCrop.x + deltaX), 1 - interaction.startCrop.width),
        y: Math.min(Math.max(0, interaction.startCrop.y + deltaY), 1 - interaction.startCrop.height),
        width: interaction.startCrop.width,
        height: interaction.startCrop.height,
      });
      return;
    }

    if (interaction.mode === "resize" && interaction.startCrop) {
      const startLeft = interaction.startCrop.x;
      const startTop = interaction.startCrop.y;
      const startRight = interaction.startCrop.x + interaction.startCrop.width;
      const startBottom = interaction.startCrop.y + interaction.startCrop.height;

      let left = startLeft;
      let top = startTop;
      let right = startRight;
      let bottom = startBottom;

      if (interaction.handle === "nw") {
        left = point.x;
        top = point.y;
      } else if (interaction.handle === "ne") {
        right = point.x;
        top = point.y;
      } else if (interaction.handle === "sw") {
        left = point.x;
        bottom = point.y;
      } else if (interaction.handle === "se") {
        right = point.x;
        bottom = point.y;
      }

      setCropArea(normalizeRect(left, top, right, bottom));
    }
  };

  const handleCropPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteraction(null);
    if (!cropArea || cropArea.width < minCropSize || cropArea.height < minCropSize) {
      setCropArea(null);
    }
  };

  const handleGenerateOutfitsMe = async (photoId: string | null | undefined, outfitIndex: number) => {
    const safePhotoId = String(photoId || "").trim();
    if (!safePhotoId) {
      toast.error("Analyze a photo first before trying it on.");
      return;
    }
    if (!imageGenerationEnabled) {
      toast.error("OutfitsMe image generation is off. Enable it in Settings > Features.");
      return;
    }
    if (!profilePhotoUrl) {
      toast.error("Profile photo is required for OutfitsMe. Upload one in Settings > Profile.");
      return;
    }
    const result = await generateOutfitsMe(safePhotoId, outfitIndex);
    if (result && typeof result === "object" && "outfitsme_image_url" in result) {
      const previewKey = buildOutfitsMePreviewKey(safePhotoId, outfitIndex);
      setOutfitsMePreviewState((current) => ({
        ...current,
        [previewKey]: String(result.outfitsme_image_url || ""),
      }));
    }
  };

  return (
    <section className="o-stack o-stack--section">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Create</span>
          <h2>Photo analysis</h2>
          <p className="tab-header-subtext">Upload a look, crop the key area, and turn it into reusable wardrobe data.</p>
        </div>
      </div>

      <div className="analysis-layout">
        <Card as="section" className="c-surface c-surface--stack">
          <div className="c-section-head o-stack o-stack--tight">
            <h3>Upload and analyze</h3>
            <p className="subtext">Best results come from a clear full-body or torso-focused outfit photo.</p>
          </div>

          {modelOptions.length > 1 ? (
            <div className="field-stack">
              <label htmlFor="analysis-model">Analysis model</label>
              <Select
                value={selectedModel}
                onValueChange={(nextValue) => {
                  if (!nextValue) {
                    return;
                  }
                  setSelectedModel(nextValue);
                }}
              >
                <SelectTrigger id="analysis-model" className="w-full">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  {(modelOptions || [])
                    .filter((model) => model.supports_image)
                    .map((model) => (
                      <SelectItem
                        key={model.id}
                        value={model.id}
                        disabled={!model.available}
                      >
                        {`${model.label}${model.available ? "" : " (Unavailable)"}`}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {modelOptions.length > 0 && !availableImageModel ? (
            <div className="settings-notice">
              <p><strong>Analysis unavailable:</strong> The managed AI service is not currently available.</p>
              <p className="subtext">{firstUnavailableImageModel?.unavailable_reason || "No image-capable model is currently available."}</p>
            </div>
          ) : null}

          <div className="quota-pill" role="status" aria-live="polite">
            {limitsLoading ? (
              <span>Loading usage limits...</span>
            ) : accessMode === "unlimited" ? (
              <span>{userRole} access: unlimited AI usage</span>
            ) : trialActive ? (
              <span>
                Trial: {usedToday}/{dailyLimit} used today ({remainingToday} left), {trialDaysRemaining} day{trialDaysRemaining === 1 ? "" : "s"} left
              </span>
            ) : (
              <span>Trial expired</span>
            )}
          </div>

          {jobStatus ? (
            <div className="info-stack">
              <p className="subtext">
                Job status: <strong>{statusLabel}</strong>
                {jobStatus.jobId ? ` (${jobStatus.jobId.slice(0, 8)})` : ""}
              </p>
              {queueSummaryText ? <p className="subtext">{queueSummaryText}</p> : null}
              {progress?.message ? <p className="subtext">{progress.message}</p> : null}
              {stageLabel ? <p className="subtext">Current stage: {stageLabel}</p> : null}
              {progressCounts && typeof progressCounts.total_items === "number" && progressCounts.total_items > 0 ? (
                <p className="subtext">
                  Item images: {progressCounts.processed_items || 0}/{progressCounts.total_items || 0} processed, {progressCounts.generated_items || 0} generated, {progressCounts.failed_items || 0} failed
                </p>
              ) : null}
              {typeof progressCurrentItem?.index === "number" ? (
                <p className="subtext">Current item {progressCurrentItem.index}: {formatItemLabel(progressCurrentItem)}</p>
              ) : null}
            </div>
          ) : null}

          {activeAnalysisCount > 0 ? (
            <p className="subtext">
              Active analysis jobs: <strong>{activeAnalysisCount}</strong> / {maxConcurrentAnalysisJobs}
            </p>
          ) : null}

          {error ? <p className="feedback-error">{error}</p> : null}
          {info ? <p className="feedback-info">{info}</p> : null}

          <ImageUploadField
            id="image-upload"
            fileName={fileName}
            onFileSelect={onFileDrop}
            title="Drag and drop an outfit image here"
            subtext="Choose an existing image or take a new photo"
            emptyText="No file selected"
          />

          {previewUrl ? (
            <>
              <div className="crop-preview-wrap">
                <AppImage
                  className="preview"
                  src={previewUrl}
                  alt="Selected outfit"
                  width={1600}
                  height={2000}
                  draggable={false}
                />
                <div
                  className="crop-overlay"
                  onPointerDown={handleCropPointerDown}
                  onPointerMove={handleCropPointerMove}
                  onPointerUp={handleCropPointerEnd}
                  onPointerCancel={handleCropPointerEnd}
                >
                  {cropArea ? (
                    <div
                      className="crop-selection"
                      style={{
                        left: `${cropArea.x * 100}%`,
                        top: `${cropArea.y * 100}%`,
                        width: `${cropArea.width * 100}%`,
                        height: `${cropArea.height * 100}%`,
                      }}
                    >
                      <span className="crop-handle nw" data-handle="nw" />
                      <span className="crop-handle ne" data-handle="ne" />
                      <span className="crop-handle sw" data-handle="sw" />
                      <span className="crop-handle se" data-handle="se" />
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="subtext">Drag on the preview to select a rectangular area. Only the selected crop is sent to analysis.</p>
            </>
          ) : null}

          <div className="o-cluster o-cluster--wrap o-cluster--stack-sm">
            {fileName ? (
              <Button type="button" variant="outline" onClick={clearSelectedFile}>
                Cancel
              </Button>
            ) : null}
            {fileName && cropArea ? (
              <Button type="button" variant="outline" onClick={() => setCropArea(null)}>
                Reset crop
              </Button>
            ) : null}
            <Button onClick={runAnalysis} disabled={disabled}>
              {loading ? "Queue another photo" : "Analyze selection"}
            </Button>
          </div>
        </Card>

        <Card as="section" className="c-surface c-surface--stack">
          <div className="o-split o-split--start o-split--stack-sm analysis-results-head">
            <div className="c-section-head o-stack o-stack--tight">
              <h3>Results</h3>
              <p className="subtext">Completed analyses stay here for this session, with each outfit grouped into an expandable result card.</p>
            </div>
            {shouldCollapseResults ? (
              <Button
                type="button"
                variant="outline"
                className="analysis-results-toggle"
                aria-expanded={resultsExpanded}
                aria-controls="analysis-results-body"
                onClick={() => setResultsExpanded((current) => !current)}
              >
                {resultsExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {resultsExpanded ? "Hide results" : "Show results"}
              </Button>
            ) : null}
          </div>

          {shouldCollapseResults && !resultsExpanded ? (
            <p className="subtext">Multiple jobs are queued. Expand this panel to review the latest completed analysis while the queue finishes.</p>
          ) : null}

          {!shouldCollapseResults || resultsExpanded ? (
            <div id="analysis-results-body" className="o-stack">
              {analysisInProgress ? (
                <div className="loading-panel o-cluster o-cluster--start" role="status" aria-live="polite">
                  <span className="loading-spinner loading-spinner-lg" aria-hidden="true" />
                  <div>
                    <p className="loading-panel-title">Analysis in progress</p>
                    <p className="subtext">{progress?.message || "Your photo is being analyzed. Results will appear here automatically."}</p>
                  </div>
                </div>
              ) : null}

              {!completedAnalyses.length && !loading ? (
                <p className="subtext">Analyze a photo to view detected outfits and reusable item breakdowns.</p>
              ) : null}

              {completedAnalyses.length ? (
                <div className="analysis-results-accordion">
                  {completedAnalyses.map((entry, analysisIndex) => {
                    const result = entry.result;
                    const outfits = result.outfits?.length ? result.outfits : [{ style: result.style, items: result.items }];
                    const analysisKey = buildAnalysisKey(entry.job_id, result.photo_id, analysisIndex);
                    const isExpanded = expandedAnalysisKeys[analysisKey] ?? analysisIndex === 0;
                    const itemCount = outfits.reduce((total, outfit) => total + (outfit.items?.length || 0), 0);
                    const summaryStyle =
                      outfits.find((outfit) => String(outfit.style || "").trim())?.style ||
                      result.style ||
                      "Unlabeled style";

                    return (
                      <Card as="article" key={analysisKey} className="c-surface c-surface--stack">
                        <button
                          type="button"
                          className="analysis-result-group-toggle"
                          aria-expanded={isExpanded}
                          aria-controls={`${analysisKey}-body`}
                          onClick={() =>
                            setExpandedAnalysisKeys((current) => ({
                              ...current,
                              [analysisKey]: !isExpanded,
                            }))
                          }
                        >
                          <span className="analysis-result-group-summary">
                            <span className="result-label">Analysis {completedAnalyses.length - analysisIndex}</span>
                            <span>
                              <strong>{summaryStyle}</strong>
                            </span>
                            <span className="analysis-result-group-meta">
                              <span>{outfits.length} outfit{outfits.length === 1 ? "" : "s"}</span>
                              <span>{itemCount} item{itemCount === 1 ? "" : "s"}</span>
                              <span>{formatCompletedAt(entry.completed_at || entry.updated_at)}</span>
                              {entry.job_id ? <span>Job {entry.job_id.slice(0, 8)}</span> : null}
                            </span>
                          </span>
                          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>

                        {isExpanded ? (
                          <div id={`${analysisKey}-body`} className="analysis-result-group-body">
                            {outfits.map((outfit, outfitIndex) => {
                              const previewKey = buildOutfitsMePreviewKey(result.photo_id, outfitIndex);
                              const outfitPreviewUrl = outfitMePreviewState[previewKey] || "";

                              return (
                                <Card as="article" key={`${analysisKey}-outfit-${outfitIndex}`} className="c-surface c-surface--stack">
                                  <div className="o-split o-split--start o-split--stack-sm">
                                    <div>
                                      <p className="result-label">Outfit {outfitIndex + 1}</p>
                                      <h4>{outfit.style || "Unlabeled style"}</h4>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      onClick={() => handleGenerateOutfitsMe(result.photo_id, outfitIndex)}
                                      disabled={outfitMeLoading || !imageGenerationEnabled || !hasGenerationAccess}
                                      title={
                                        !hasGenerationAccess
                                          ? "Trial or paid access required for try-on previews"
                                          : !imageGenerationEnabled
                                            ? "Enable outfit image generation in Settings"
                                            : profilePhotoUrl
                                              ? "Generate a try-on preview"
                                              : "Profile photo required for try-on previews"
                                      }
                                    >
                                      <Wand2 size={16} />
                                      {outfitMeLoading ? "Generating..." : "Try it on"}
                                    </Button>
                                  </div>

                                  <ul className="o-list">
                                    {(outfit.items || []).map((item, itemIndex) => (
                                      <li key={`${analysisKey}-item-${outfitIndex}-${itemIndex}`} className="analysis-item">
                                        {item.image_url ? (
                                          <Button
                                            type="button"
                                            variant="outline"
                                            className="history-thumb-btn"
                                            onClick={(event) => {
                                              event.stopPropagation();
                                              setItemPreview({
                                                image_url: item.image_url || "",
                                                name: item.name || "Detected item",
                                              });
                                            }}
                                            aria-label="Open item image preview"
                                            title="Open item image preview"
                                          >
                                            <AppImage
                                              src={item.image_url}
                                              alt={item.name || "Detected item"}
                                              className="analysis-item-thumb"
                                              width={64}
                                              height={64}
                                            />
                                          </Button>
                                        ) : null}
                                        <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                                        <span className="analysis-item-copy">
                                          <span>{formatItemLabel(item)}</span>
                                          {item.description ? (
                                            <span className="subtext">{item.description}</span>
                                          ) : null}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>

                                  {outfitPreviewUrl ? (
                                    <AppImage
                                      src={outfitPreviewUrl}
                                      alt={`OutfitsMe preview for outfit ${outfitIndex + 1}`}
                                      className="analysis-outfitsme-preview"
                                      width={1600}
                                      height={2000}
                                    />
                                  ) : null}
                                </Card>
                              );
                            })}
                          </div>
                        ) : null}
                      </Card>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="c-surface c-surface--stack">
        <HistoryTab />
      </Card>

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
