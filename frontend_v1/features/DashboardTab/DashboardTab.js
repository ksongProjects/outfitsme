import BaseButton from "../../components/ui/BaseButton";

export default function DashboardTab({
  stats,
  refreshStats,
  loading,
  analysisLimits,
  limitsLoading,
  history,
  historyLoading
}) {
  const highlights = stats?.highlights || {};
  const clothingItemTypes = stats?.clothing_item_types || [];
  const accessoryItemTypes = stats?.accessory_item_types || [];
  const topColors = stats?.top_colors || [];
  const categorySplit = stats?.category_split || {};
  const clothingItemsCount = categorySplit.clothing_items_count ?? 0;
  const accessoriesItemsCount = categorySplit.accessories_items_count ?? 0;
  const dailyLimit = analysisLimits?.daily_limit ?? 0;
  const usedToday = analysisLimits?.used_today ?? 0;
  const remainingToday = analysisLimits?.remaining_today;
  const trialActive = Boolean(analysisLimits?.trial_active);
  const trialDaysRemaining = analysisLimits?.trial_days_remaining ?? 0;
  const accessMode = analysisLimits?.access_mode || "trial";
  const userRole = analysisLimits?.user_role || "trial";
  const recentActions = (history || []).slice(0, 5);

  return (
    <section>
      <div className="tab-header">
        <div className="tab-header-title">
          <h2>Home</h2>
          <p className="tab-header-subtext">Track your outfit insights and wardrobe trends.</p>
        </div>
        <BaseButton variant="ghost" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </BaseButton>
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

        <article className="settings-card quota-scroll-card">
          <h3>Quota and recent actions</h3>
          {limitsLoading ? (
            <p className="subtext">Loading usage limits...</p>
          ) : accessMode === "unlimited" ? (
            <p className="subtext">Access level: <strong>{userRole}</strong>. AI usage: <strong>unlimited</strong></p>
          ) : trialActive ? (
            <p className="subtext">
              Trial usage today: <strong>{usedToday}/{dailyLimit}</strong> used ({remainingToday} left). Trial days left: <strong>{trialDaysRemaining}</strong>
            </p>
          ) : (
            <p className="subtext">Trial status: <strong>expired</strong></p>
          )}
          {historyLoading ? (
            <p className="subtext">Loading recent actions...</p>
          ) : recentActions.length === 0 ? (
            <p className="subtext">No recent activity yet. Analyze a photo to get started.</p>
          ) : (
            <ul className="compact-list">
              {recentActions.map((entry) => (
                <li key={`recent-action-${entry.job_id}`}>
                  <strong>{entry.status || "Unknown"}</strong> via {entry.analysis_model || "Unknown"}{" "}
                  <span className="subtext">
                    ({entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>
    </section>
  );
}
