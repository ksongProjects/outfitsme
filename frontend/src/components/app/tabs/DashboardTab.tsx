"use client";

import { BarChart3, Clock3, Images, ShirtIcon, SparklesIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    <section className="o-stack o-stack--section">
      <div className="tab-header">
        <div className="tab-header-title">
          <span className="section-kicker">Overview</span>
          <h2>Style dashboard</h2>
          <p className="tab-header-subtext">
            Track your wardrobe growth, AI usage, and the patterns emerging from your outfit history.
          </p>
        </div>
        <Button variant="outline" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="o-grid o-grid--stats">
        <Card as="article" className="c-surface c-surface--stack c-surface--accent">
          <SparklesIcon size={18} className="stats-icon"/>
          <p className="stats-label">Completed jobs</p>
          <p className="stats-value">{stats.analyses_count}</p>
        </Card>
        <Card as="article" className="c-surface c-surface--stack c-surface--accent">
          <Images size={18} className="stats-icon"/>
          <p className="stats-label">Generated outfit images</p>
          <p className="stats-value">{stats.generated_outfit_images_count ?? stats.outfits_count}</p>
        </Card>
        <Card as="article" className="c-surface c-surface--stack c-surface--accent">
          <ShirtIcon size={18} className="stats-icon"/>
          <p className="stats-label">Items cataloged</p>
          <p className="stats-value">{stats.items_count}</p>
        </Card>
      </div>

      <div className="o-grid o-grid--cards">
        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-split o-split--start o-split--stack-sm">
            <h3>Top clothing types</h3>
            <BarChart3 size={18} />
          </div>
          {itemTypeCounts.length === 0 ? (
            <p className="subtext">Analyze a few outfits to unlock clothing type counts.</p>
          ) : (
            <ul className="o-list o-list--split">
              {itemTypeCounts.map((entry) => (
                <li key={`item-type-${entry.label}`}>
                  <strong>{entry.label}</strong>
                  <span className="subtext">{entry.count} tracked</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-split o-split--start o-split--stack-sm">
            <h3>Simple totals</h3>
            <ShirtIcon size={18} />
          </div>
          <div className="insight-summary">
            <p>Photos analyzed: <strong>{stats.photos_count ?? 0}</strong></p>
            <p>Completed jobs this week: <strong>{stats.weekly_activity?.analyses_count ?? 0}</strong></p>
            <p>Generated outfit images this week: <strong>{stats.weekly_activity?.outfits_count ?? 0}</strong></p>
            <p>Items added this week: <strong>{stats.weekly_activity?.items_count ?? 0}</strong></p>
          </div>
        </Card>

        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-split o-split--start o-split--stack-sm">
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
            <ul className="o-list o-list--split">
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
        </Card>
      </div>
    </section>
  );
}


