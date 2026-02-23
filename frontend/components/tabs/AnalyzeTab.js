import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useState } from "react";
import { useAnalysisContext } from "../../context/DashboardContext";

export default function AnalyzeTab() {
  const [isDragOver, setIsDragOver] = useState(false);
  const {
    previewUrl,
    onFileChange,
    onFileDrop,
    fileName,
    clearSelectedFile,
    runAnalysis,
    disabled,
    loading,
    analysis,
    similarResults,
    selectedModel,
    setSelectedModel,
    modelOptions,
    jobStatus,
    analysisLimits,
    limitsLoading
  } = useAnalysisContext();
  const detectedOutfits = analysis?.outfits || [];
  const monthlyLimit = analysisLimits?.monthly_limit ?? 0;
  const usedThisMonth = analysisLimits?.used_this_month ?? 0;
  const remainingThisMonth = analysisLimits?.remaining_this_month;
  const hasMonthlyCap = monthlyLimit > 0;

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setIsDragOver(false);
    const droppedFile = event.dataTransfer?.files?.[0];
    if (!droppedFile) {
      return;
    }
    await onFileDrop(droppedFile);
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
        <select
          id="analysis-model"
          className="text-input"
          value={selectedModel}
          onChange={(event) => setSelectedModel(event.target.value)}
        >
          {(modelOptions || []).filter((model) => model.supports_image).map((model) => (
            <option key={model.id} value={model.id} disabled={!model.available}>
              {model.label}{model.available ? "" : " (Unavailable)"}
            </option>
          ))}
        </select>
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
          <p className="subtext">
            Queue status: <strong>{jobStatus.status}</strong>{jobStatus.jobId ? ` (job ${jobStatus.jobId.slice(0, 8)})` : ""}
          </p>
        ) : null}
        <label
          htmlFor="image-upload"
          className={`dropzone ${isDragOver ? "is-dragover" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <p className="dropzone-title">Drag and drop an image here</p>
          <p className="dropzone-subtext">or click to browse files</p>
          <p className="dropzone-file">{fileName || "No file selected"}</p>
        </label>
        <input id="image-upload" className="file-input-hidden" type="file" accept="image/*" onChange={onFileChange} />
        {previewUrl ? <img className="preview" src={previewUrl} alt="Selected outfit" /> : null}
        <div className="button-row">
          {fileName ? (
            <button type="button" className="ghost-btn" onClick={clearSelectedFile}>
              Cancel
            </button>
          ) : null}
          <button className="primary-btn" onClick={runAnalysis} disabled={disabled}>
            {loading ? "Analyzing..." : "Analyze photo"}
          </button>
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
                      <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                      <span>{formatItemLabel(item)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        ) : null}

        {similarResults.length > 0 ? (
          <>
            <h3>Similar items</h3>
            <ul>
              {similarResults.map((result) => (
                <li key={`${result.store}-${result.item}`}>
                  <strong>{result.item}</strong> - {result.store} - {result.price} - {result.availability}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        </section>
      </div>
    </section>
  );
}
