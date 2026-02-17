import { formatItemLabel, getItemIcon } from "../../utils/formatters";
import { useState } from "react";

export default function AnalyzeTab({
  previewUrl,
  onFileChange,
  onFileDrop,
  fileName,
  clearSelectedFile,
  runAnalysis,
  disabled,
  loading,
  analysis,
  similarResults
}) {
  const [isDragOver, setIsDragOver] = useState(false);

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
    <div className="analysis-layout">
      <section>
        <label htmlFor="image-upload">Outfit photo</label>
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
            {loading ? "Analyzing..." : "Analyze outfit"}
          </button>
        </div>
      </section>

      <section>
        <h2>Results</h2>
        {!analysis ? <p className="subtext">Run analysis to view detected style and items.</p> : null}
        {analysis ? (
          <>
            <p>
              <strong>Style:</strong> {analysis.style}
            </p>
            <ul className="analysis-items">
              {analysis.items.map((item) => (
                <li key={item.name} className="analysis-item">
                  <span className="item-icon" aria-hidden="true">{getItemIcon(item)}</span>
                  <span>{formatItemLabel(item)}</span>
                </li>
              ))}
            </ul>
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
  );
}
