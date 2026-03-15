"use client";

import { BarChart3, Clock3, Palette, Shirt, Sparkles } from "lucide-react";

import BaseButton from "@/components/app/ui/BaseButton";
import type { AnalysisLimits, HistoryEntry, StatsPayload } from "@/lib/types";

type DashboardTabProps = {
  stats: StatsPayload;
  refreshStats: () => Promise<void>;
  loading: boolean;
  analysisLimits: AnalysisLimits | null;
  limitsLoading: boolean;
  history: HistoryEntry[];
  historyLoading: boolean;
};

export default function DashboardTab({
  stats,
  refreshStats,
  loading,
  analysisLimits,
  limitsLoading,
  history,
  historyLoading,
}: DashboardTabProps) {
  const highlights = stats?.highlights || {};
  const clothingItemTypes = stats?.clothing_item_types || [];
  const accessoryItemTypes = stats?.accessory_item_types || [];
  const topColors = stats?.top_colors || [];
  const categorySplit = stats?.category_split || {};
  const dailyLimit = analysisLimits?.daily_limit ?? 0;
  const usedToday = analysisLimits?.used_today ?? 0;
  const remainingToday = analysisLimits?.remaining_today;
  const trialActive = Boolean(analysisLimits?.trial_active);
  const trialDaysRemaining = analysisLimits?.trial_days_remaining ?? 0;
  const accessMode = analysisLimits?.access_mode || "trial";
  const userRole = analysisLimits?.user_role || "trial";
  const recentActions = (history || []).slice(0, 5);

  return (
    <section className="tab-stack">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Overview</span>
          <h2>Style dashboard</h2>
          <p className="tab-header-subtext">
            Track your wardrobe growth, AI usage, and the patterns emerging from your outfit history.
          </p>
        </div>
        <BaseButton variant="ghost" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </BaseButton>
      </div>

      <div className="stats-grid">
        <article className="stats-card stats-card-accent">
          <span className="stats-icon"><Sparkles size={18} /></span>
          <p className="stats-label">Photos analyzed</p>
          <p className="stats-value">{stats.photos_count ?? stats.analyses_count}</p>
        </article>
        <article className="stats-card">
          <span className="stats-icon"><Shirt size={18} /></span>
          <p className="stats-label">Outfits saved</p>
          <p className="stats-value">{stats.outfits_count}</p>
        </article>
        <article className="stats-card">
          <span className="stats-icon"><Palette size={18} /></span>
          <p className="stats-label">Items cataloged</p>
          <p className="stats-value">{stats.items_count}</p>
        </article>
      </div>

      <div className="dashboard-layout">
        <article className="settings-card insight-card">
          <div className="card-heading-row">
            <h3>Top clothing types</h3>
            <BarChart3 size={18} />
          </div>
          {clothingItemTypes.length === 0 ? (
            <p className="subtext">Analyze a few outfits to unlock detailed clothing breakdowns.</p>
          ) : (
            <ul className="compact-list">
              {clothingItemTypes.map((entry) => (
                <li key={`item-type-${entry.label}`}>
                  <strong>{entry.label}</strong>
                  <span className="subtext">{entry.count} tracked</span>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="settings-card insight-card">
          <div className="card-heading-row">
            <h3>Accessory and color highlights</h3>
            <Sparkles size={18} />
          </div>
          {accessoryItemTypes.length === 0 ? (
            <p className="subtext">No accessories tracked yet. Turn on accessory analysis to enrich this view.</p>
          ) : (
            <ul className="compact-list">
              {accessoryItemTypes.slice(0, 4).map((entry) => (
                <li key={`accessory-type-${entry.label}`}>
                  <strong>{entry.label}</strong>
                  <span className="subtext">{entry.count} tracked</span>
                </li>
              ))}
            </ul>
          )}
          <div className="insight-summary">
            <p>Most common accessory: <strong>{highlights.most_common_accessory_type || "N/A"}</strong></p>
            <p>Most common color: <strong>{highlights.most_common_color || "N/A"}</strong></p>
            <p>Clothing items tracked: <strong>{categorySplit.clothing_items_count ?? 0}</strong></p>
            <p>Accessory items tracked: <strong>{categorySplit.accessories_items_count ?? 0}</strong></p>
            <p>Top colors captured: <strong>{topColors.length}</strong></p>
          </div>
        </article>

        <article className="settings-card insight-card">
          <div className="card-heading-row">
            <h3>Usage and recent activity</h3>
            <Clock3 size={18} />
          </div>
          {limitsLoading ? (
            <p className="subtext">Loading usage limits...</p>
          ) : accessMode === "unlimited" ? (
            <p className="subtext">Access level: <strong>{userRole}</strong>. AI usage is currently unlimited.</p>
          ) : trialActive ? (
            <p className="subtext">
              Trial usage today: <strong>{usedToday}/{dailyLimit}</strong> used, <strong>{remainingToday}</strong> left. Trial days remaining: <strong>{trialDaysRemaining}</strong>.
            </p>
          ) : (
            <p className="subtext">Trial status: <strong>expired</strong>.</p>
          )}
          {historyLoading ? (
            <p className="subtext">Loading recent activity...</p>
          ) : recentActions.length === 0 ? (
            <p className="subtext">No recent activity yet. Analyze a photo to get started.</p>
          ) : (
            <ul className="compact-list">
              {recentActions.map((entry) => (
                <li key={`recent-action-${entry.job_id}`}>
                  <strong>{entry.status || "Unknown"}</strong>
                  <span className="subtext">
                    {entry.analysis_model || "Unknown model"} ? {entry.created_at ? new Date(entry.created_at).toLocaleString() : "-"}
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

