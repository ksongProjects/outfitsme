import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useState } from "react";
import { useAnalysisContext } from "../../context/DashboardContext";
import HistoryTab from "./HistoryTab";
import BaseButton from "../ui/BaseButton";
import BaseSelect from "../ui/BaseSelect";
import ImageUploadField from "../ui/ImageUploadField";

export default function AnalyzeTab() {
  const [interaction, setInteraction] = useState(null);
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
    limitsLoading
  } = useAnalysisContext();
  const detectedOutfits = analysis?.outfits || [];
  const monthlyLimit = analysisLimits?.monthly_limit ?? 0;
  const usedThisMonth = analysisLimits?.used_this_month ?? 0;
  const remainingThisMonth = analysisLimits?.remaining_this_month;
  const hasMonthlyCap = monthlyLimit > 0;
  const progress = jobStatus?.progress || null;
  const progressCounts = progress?.counts || null;
  const progressCurrentItem = progress?.current_item || null;

  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const MIN_CROP_SIZE = 0.01;

  const getRelativePoint = (event) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return null;
    }
    const x = clamp01((event.clientX - bounds.left) / bounds.width);
    const y = clamp01((event.clientY - bounds.top) / bounds.height);
    return { x, y };
  };

  const isPointInsideCrop = (point, crop) => {
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

  const normalizeRect = (ax, ay, bx, by) => {
    const x = clamp01(Math.min(ax, bx));
    const y = clamp01(Math.min(ay, by));
    const right = clamp01(Math.max(ax, bx));
    const bottom = clamp01(Math.max(ay, by));
    return {
      x,
      y,
      width: Math.max(0, right - x),
      height: Math.max(0, bottom - y)
    };
  };

  const handleCropPointerDown = (event) => {
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
    const resizeHandle = event.target?.dataset?.handle || null;
    if (resizeHandle && cropArea) {
      setInteraction({
        mode: "resize",
        pointerId: event.pointerId,
        startPoint: point,
        startCrop: cropArea,
        handle: resizeHandle
      });
      return;
    }

    if (cropArea && isPointInsideCrop(point, cropArea)) {
      setInteraction({
        mode: "move",
        pointerId: event.pointerId,
        startPoint: point,
        startCrop: cropArea,
        handle: null
      });
      return;
    }

    setInteraction({
      mode: "draw",
      pointerId: event.pointerId,
      startPoint: point,
      startCrop: null,
      handle: null
    });
    setCropArea({ x: point.x, y: point.y, width: 0, height: 0 });
  };

  const handleCropPointerMove = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    const point = getRelativePoint(event);
    if (!point) {
      return;
    }
    if (interaction.mode === "draw") {
      const nextCrop = normalizeRect(interaction.startPoint.x, interaction.startPoint.y, point.x, point.y);
      setCropArea(nextCrop);
      return;
    }

    if (interaction.mode === "move" && interaction.startCrop) {
      const deltaX = point.x - interaction.startPoint.x;
      const deltaY = point.y - interaction.startPoint.y;
      const nextX = Math.min(
        Math.max(0, interaction.startCrop.x + deltaX),
        1 - interaction.startCrop.width
      );
      const nextY = Math.min(
        Math.max(0, interaction.startCrop.y + deltaY),
        1 - interaction.startCrop.height
      );
      setCropArea({
        x: nextX,
        y: nextY,
        width: interaction.startCrop.width,
        height: interaction.startCrop.height
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

      const nextCrop = normalizeRect(left, top, right, bottom);
      setCropArea(nextCrop);
    }
  };

  const handleCropPointerEnd = (event) => {
    if (!interaction || interaction.pointerId !== event.pointerId) {
      return;
    }
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setInteraction(null);
    if (!cropArea || cropArea.width < MIN_CROP_SIZE || cropArea.height < MIN_CROP_SIZE) {
      setCropArea(null);
      return;
    }
  };

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Photo analysis</h2>
          <p className="tab-header-subtext">Upload a photo to detect outfit styles and items.</p>
        </div>
      </div>
      <div className="analysis-layout">
        <section>
        <label htmlFor="image-upload">Photo</label>
        <label htmlFor="analysis-model">Analysis model</label>
        <BaseSelect
          id="analysis-model"
          value={selectedModel}
          onValueChange={(nextValue) => setSelectedModel(nextValue)}
          options={(modelOptions || [])
            .filter((model) => model.supports_image)
            .map((model) => ({
              value: model.id,
              label: `${model.label}${model.available ? "" : " (Unavailable)"}`,
              disabled: !model.available
            }))}
          placeholder="Select model"
        />
        {(modelOptions || []).some((model) => model.supports_image && !model.available) ? (
          <p className="subtext">
            Unavailable models: {(modelOptions || [])
              .filter((model) => model.supports_image && !model.available)
              .map((model) => `${model.label} - ${model.unavailable_reason}`)
              .join(" | ")}
          </p>
        ) : null}
        <div className="quota-pill" role="status" aria-live="polite">
          {limitsLoading ? (
            <span>Loading usage limits...</span>
          ) : hasMonthlyCap ? (
            <span>
              Monthly quota: {usedThisMonth}/{monthlyLimit} used ({remainingThisMonth} left)
            </span>
          ) : (
            <span>Monthly quota: unlimited</span>
          )}
        </div>
        {jobStatus ? (
          <>
            <p className="subtext">
              Queue status: <strong>{jobStatus.status}</strong>{jobStatus.jobId ? ` (job ${jobStatus.jobId.slice(0, 8)})` : ""}
            </p>
            {progress?.message ? (
              <p className="subtext">{progress.message}</p>
            ) : null}
            {progress?.stage ? (
              <p className="subtext">Current stage: {progress.stage}</p>
            ) : null}
            {progressCounts && progressCounts.disabled ? (
              <p className="subtext">Item image generation is disabled.</p>
            ) : null}
            {progressCounts && typeof progressCounts.total_items === "number" && progressCounts.total_items > 0 ? (
              <p className="subtext">
                Item images: {progressCounts.processed_items || 0}/{progressCounts.total_items || 0} processed, {progressCounts.generated_items || 0} generated, {progressCounts.failed_items || 0} failed
              </p>
            ) : null}
            {progressCurrentItem?.index ? (
              <p className="subtext">
                Current item {progressCurrentItem.index}: {formatItemLabel(progressCurrentItem)}
              </p>
            ) : null}
          </>
        ) : null}
        {activeAnalysisCount > 0 ? (
          <p className="subtext">
            Active analysis jobs: <strong>{activeAnalysisCount}</strong> / {maxConcurrentAnalysisJobs}
          </p>
        ) : null}
        <ImageUploadField
          id="image-upload"
          fileName={fileName}
          onFileSelect={onFileDrop}
          title="Drag and drop an image here"
          subtext="or click to browse files"
          emptyText="No file selected"
        />
        {previewUrl ? (
          <div className="crop-preview-wrap">
            <img className="preview" src={previewUrl} alt="Selected outfit" draggable={false} />
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
                    height: `${cropArea.height * 100}%`
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
        ) : null}
        {previewUrl ? (
          <p className="subtext">
            Drag on the preview to select a rectangular area. Only the selected crop is sent to analysis.
          </p>
        ) : null}
        <div className="button-row">
          {fileName ? (
            <BaseButton type="button" variant="ghost" onClick={clearSelectedFile}>
              Cancel
            </BaseButton>
          ) : null}
          {fileName && cropArea ? (
            <BaseButton type="button" variant="ghost" onClick={() => setCropArea(null)}>
              Reset crop
            </BaseButton>
          ) : null}
          <BaseButton variant="primary" onClick={runAnalysis} disabled={disabled}>
            {loading ? "Queue another photo" : "Analyze selection"}
          </BaseButton>
        </div>
        </section>

        <section>
        <h2>Results</h2>
        {!analysis ? <p className="subtext">Analyze a photo to view detected style and items.</p> : null}
        {analysis ? (
          <>
            {detectedOutfits.length > 0 ? (
              <>
                {detectedOutfits.map((outfit, index) => (
                  <div key={`outfit-${index}`} className="outfit-group">
                    <p>
                      <strong>Outfit {index + 1}:</strong> {outfit.style}
                    </p>
                    <ul className="analysis-items">
                      {(outfit.items || []).map((item, itemIndex) => (
                        <li key={`${index}-${item.name}-${itemIndex}`} className="analysis-item">
                          {item.image_url ? (
                            <img src={item.image_url} alt={item.name || "Detected item"} className="analysis-item-thumb" />
                          ) : null}
                          <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                          <span>{formatItemLabel(item)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </>
            ) : (
              <>
                <p>
                  <strong>Style:</strong> {analysis.style}
                </p>
                <ul className="analysis-items">
                  {analysis.items.map((item, itemIndex) => (
                    <li key={`${item.name}-${itemIndex}`} className="analysis-item">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name || "Detected item"} className="analysis-item-thumb" />
                      ) : null}
                      <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                      <span>{formatItemLabel(item)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}
        </section>
      </div>
      <div className="analysis-history-wrap">
        <HistoryTab />
      </div>
    </section>
  );
}
