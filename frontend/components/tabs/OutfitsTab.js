import { useWardrobeContext } from "../../context/DashboardContext";

export default function OutfitsTab() {
  const {
    wardrobe,
    wardrobeLoading,
    wardrobeMessage,
    loadWardrobe,
    deleteWardrobeEntry,
    openOriginalPhoto,
    originalPhotoUrl,
    closeOriginalPhoto
  } = useWardrobeContext();

  return (
    <section>
      <div className="toolbar-row">
        <h2>Your outfits</h2>
        <button className="ghost-btn" onClick={loadWardrobe} disabled={wardrobeLoading}>
          {wardrobeLoading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {wardrobeMessage ? <p className="subtext">{wardrobeMessage}</p> : null}

      <table className="data-table">
        <thead>
          <tr>
            <th>Style</th>
            <th>Created</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {wardrobe.map((entry) => (
            <tr key={entry.photo_id}>
              <td>{entry.style_label || "Unlabeled"}</td>
              <td>{new Date(entry.created_at).toLocaleString()}</td>
              <td>
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => openOriginalPhoto(entry.photo_id)}
                >
                  View original
                </button>
                <button
                  type="button"
                  className="ghost-btn danger-btn"
                  onClick={() => deleteWardrobeEntry(entry.photo_id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {originalPhotoUrl ? (
        <div className="modal-backdrop" onClick={closeOriginalPhoto}>
          <div className="modal-panel" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Original photo</h3>
              <button type="button" className="ghost-btn" onClick={closeOriginalPhoto}>Close</button>
            </div>
            <img src={originalPhotoUrl} alt="Original outfit" className="modal-image" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
