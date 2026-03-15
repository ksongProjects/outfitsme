"use client";

import { BarChart3, Clock3, Images, ShirtIcon, SparklesIcon } from "lucide-react";

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
  const itemTypeCounts = stats?.top_item_types || [];
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
          <SparklesIcon size={18} className="stats-icon"/>
          <p className="stats-label">Completed jobs</p>
          <p className="stats-value">{stats.analyses_count}</p>
        </article>
        <article className="stats-card stats-card-accent">
          <Images size={18} className="stats-icon"/>
          <p className="stats-label">Generated outfit images</p>
          <p className="stats-value">{stats.generated_outfit_images_count ?? stats.outfits_count}</p>
        </article>
        <article className="stats-card stats-card-accent">
          <ShirtIcon size={18} className="stats-icon"/>
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
          {itemTypeCounts.length === 0 ? (
            <p className="subtext">Analyze a few outfits to unlock clothing type counts.</p>
          ) : (
            <ul className="compact-list">
              {itemTypeCounts.map((entry) => (
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
            <h3>Simple totals</h3>
            <ShirtIcon size={18} />
          </div>
          <div className="insight-summary">
            <p>Photos analyzed: <strong>{stats.photos_count ?? 0}</strong></p>
            <p>Completed jobs this week: <strong>{stats.weekly_activity?.analyses_count ?? 0}</strong></p>
            <p>Generated outfit images this week: <strong>{stats.weekly_activity?.outfits_count ?? 0}</strong></p>
            <p>Items added this week: <strong>{stats.weekly_activity?.items_count ?? 0}</strong></p>
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


