import { formatItemLabel, getItemIcon } from "../../utils/formatters";

export default function AnalyzeTab({
  previewUrl,
  onFileChange,
  runAnalysis,
  disabled,
  loading,
  analysis,
  similarResults
}) {
  return (
    <div className="analysis-layout">
      <section>
        <label htmlFor="image-upload">Outfit photo</label>
        <input id="image-upload" type="file" accept="image/*" onChange={onFileChange} />
        {previewUrl ? <img className="preview" src={previewUrl} alt="Selected outfit" /> : null}
        <button className="primary-btn" onClick={runAnalysis} disabled={disabled}>
          {loading ? "Analyzing..." : "Analyze outfit"}
        </button>
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
