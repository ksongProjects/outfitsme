export default function DashboardTab({ stats, refreshStats, loading }) {
  const highlights = stats?.highlights || {};
  const detailedItemTypes = stats?.detailed_item_types || [];
  const topItemTypes = detailedItemTypes.length > 0 ? detailedItemTypes : (stats?.top_item_types || []);
  const topColors = stats?.top_colors || [];
  const latestOutfit = stats?.latest_outfit || null;

  return (
    <section>
      <div className="toolbar-row">
        <h2>Dashboard overview</h2>
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
        <article className="stats-card">
          <p className="stats-label">Avg items per outfit</p>
          <p className="stats-value">{highlights.avg_items_per_outfit || 0}</p>
        </article>
      </div>

      <div className="dashboard-layout">
        <article className="settings-card">
          <h3>Clothing type breakdown</h3>
          {topItemTypes.length === 0 ? (
            <p className="subtext">Analyze a few outfits to see detailed clothing-type counts.</p>
          ) : (
            <ul className="compact-list">
              {topItemTypes.map((entry) => (
                <li key={`item-type-${entry.label}`}>
                  <strong>{entry.label}</strong> <span className="subtext">({entry.count})</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="settings-card">
          <h3>Interesting facts</h3>
          <ul className="compact-list">
            <li>Most common item type: <strong>{highlights.most_common_item_type || "N/A"}</strong></li>
            <li>Most common color: <strong>{highlights.most_common_color || "N/A"}</strong></li>
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
