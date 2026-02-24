export default function DashboardTab({ stats, refreshStats, loading }) {
  const highlights = stats?.highlights || {};
  const clothingItemTypes = stats?.clothing_item_types || [];
  const accessoryItemTypes = stats?.accessory_item_types || [];
  const topColors = stats?.top_colors || [];
  const categorySplit = stats?.category_split || {};
  const clothingItemsCount = categorySplit.clothing_items_count ?? 0;
  const accessoriesItemsCount = categorySplit.accessories_items_count ?? 0;
  const latestOutfit = stats?.latest_outfit || null;

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Home</h2>
          <p className="tab-header-subtext">Track your outfit insights and wardrobe trends.</p>
        </div>
        <button className="ghost-btn" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="stats-grid">
        <article className="stats-card">
          <p className="stats-label">Photos analyzed</p>
          <p className="stats-value">{stats.photos_count ?? stats.analyses_count}</p>
        </article>
        <article className="stats-card">
          <p className="stats-label">Outfits saved</p>
          <p className="stats-value">{stats.outfits_count}</p>
        </article>
        <article className="stats-card">
          <p className="stats-label">Items cataloged</p>
          <p className="stats-value">{stats.items_count}</p>
        </article>
      </div>

      <div className="dashboard-layout">
        <article className="settings-card">
          <h3>Clothing type breakdown</h3>
          {clothingItemTypes.length === 0 ? (
            <p className="subtext">Analyze a few outfits to see detailed clothing-type counts.</p>
          ) : (
            <ul className="compact-list">
              {clothingItemTypes.map((entry) => (
                <li key={`item-type-${entry.label}`}>
                  <strong>{entry.label}</strong> <span className="subtext">({entry.count})</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="settings-card">
          <h3>Accessories breakdown</h3>
          {accessoryItemTypes.length === 0 ? (
            <p className="subtext">No accessories tracked yet. Analyze more outfits to build this view.</p>
          ) : (
            <ul className="compact-list">
              {accessoryItemTypes.map((entry) => (
                <li key={`accessory-type-${entry.label}`}>
                  <strong>{entry.label}</strong> <span className="subtext">({entry.count})</span>
                </li>
              ))}
            </ul>
          )}
          <ul className="compact-list">
            <li>Most common accessory: <strong>{highlights.most_common_accessory_type || "N/A"}</strong></li>
            <li>Most common color: <strong>{highlights.most_common_color || "N/A"}</strong></li>
            <li>Clothing items tracked: <strong>{clothingItemsCount}</strong></li>
            <li>Accessories tracked: <strong>{accessoriesItemsCount}</strong></li>
            <li>Top colors tracked: <strong>{topColors.length}</strong></li>
          </ul>
        </article>

        <article className="settings-card">
          <h3>Latest outfit snapshot</h3>
          {latestOutfit?.image_url ? (
            <img src={latestOutfit.image_url} alt="Latest outfit" className="preview dashboard-preview" />
          ) : (
            <p className="subtext">No outfit photo yet. Analyze your first look to start your dashboard.</p>
          )}
          {latestOutfit?.created_at ? (
            <p className="subtext">Captured {new Date(latestOutfit.created_at).toLocaleString()}</p>
          ) : null}
        </article>
      </div>
    </section>
  );
}
