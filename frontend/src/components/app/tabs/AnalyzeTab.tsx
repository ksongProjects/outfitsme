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
  const [outfitMePreviewState, setOutfitsMePreviewState] = useState<{
    photoId: string | null;
    previews: Record<number, string>;
  }>({
    photoId: null,
    previews: {},
  });
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
    analysis,
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
  const activePhotoId = analysis?.photo_id || null;
  const outfitMePreviewByIndex =
    outfitMePreviewState.photoId === activePhotoId ? outfitMePreviewState.previews : {};
  const detectedOutfits = analysis?.outfits || [];
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

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
  const minCropSize = 0.01;

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

  const handleGenerateOutfitsMe = async (outfitIndex: number) => {
    if (!activePhotoId) {
      toast.error("Analyze a photo first before using OutfitsMe.");
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
    const result = await generateOutfitsMe(activePhotoId, outfitIndex);
    if (result && typeof result === "object" && "outfitsme_image_url" in result) {
      setOutfitsMePreviewState((current) => ({
        photoId: activePhotoId,
        previews: {
          ...(current.photoId === activePhotoId ? current.previews : {}),
          [outfitIndex]: String(result.outfitsme_image_url || ""),
        },
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
              <p className="subtext">Detected outfits and wardrobe-ready item breakdowns from your latest completed analysis.</p>
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

              {!analysis && !loading ? (
                <p className="subtext">Analyze a photo to view detected outfits and reusable item breakdowns.</p>
              ) : null}

              {analysis ? (
                <div className="o-stack">
                  {(detectedOutfits.length > 0 ? detectedOutfits : [{ style: analysis.style, items: analysis.items }]).map((outfit, index) => (
                    <Card as="article" key={`analysis-outfit-${index}`} className="c-surface c-surface--stack">
                      <div className="o-split o-split--start o-split--stack-sm">
                        <div>
                          <p className="result-label">Outfit {index + 1}</p>
                          <h4>{outfit.style || "Unlabeled style"}</h4>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleGenerateOutfitsMe(index)}
                          disabled={outfitMeLoading || !imageGenerationEnabled || !trialActive}
                          title={
                            !trialActive
                              ? "Trial required for OutfitsMe"
                              : !imageGenerationEnabled
                                ? "Enable outfit image generation in Settings"
                                : profilePhotoUrl
                                  ? "Generate OutfitsMe preview"
                                  : "Profile photo required for OutfitsMe"
                          }
                        >
                          <Wand2 size={16} />
                          {outfitMeLoading ? "Generating..." : "OutfitsMe"}
                        </Button>
                      </div>

                      <ul className="o-list">
                        {(outfit.items || []).map((item, itemIndex) => (
                          <li key={`analysis-item-${index}-${itemIndex}`} className="analysis-item">
                            {item.image_url ? (
                              <AppImage
                                src={item.image_url}
                                alt={item.name || "Detected item"}
                                className="analysis-item-thumb"
                                width={64}
                                height={64}
                              />
                            ) : null}
                            <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                            <span>{formatItemLabel(item)}</span>
                          </li>
                        ))}
                      </ul>

                      {outfitMePreviewByIndex[index] ? (
                        <AppImage
                          src={outfitMePreviewByIndex[index]}
                          alt={`OutfitsMe preview for outfit ${index + 1}`}
                          className="analysis-outfitsme-preview"
                          width={1600}
                          height={2000}
                        />
                      ) : null}
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </Card>
      </div>

      <Card className="c-surface c-surface--stack">
        <HistoryTab />
      </Card>
    </section>
  );
}

