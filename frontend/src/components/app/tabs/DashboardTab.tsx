"use client";

import {
  CircleCheckIcon,
  CircleXIcon,
  Clock3,
  Images,
  ShirtIcon,
  SparklesIcon,
} from "lucide-react";

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
            Track your wardrobe growth, AI usage, and the patterns emerging from
            your outfit history.
          </p>
        </div>
        <Button variant="outline" onClick={refreshStats} disabled={loading}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="o-grid o-grid--stats">
        <Card
          as="article"
          className="c-surface c-surface--stack c-surface--accent"
        >
          <div className="o-cluster o-cluster--center">
            <SparklesIcon size={18} className="stats-icon" />
            <p className="stats-label">Completed jobs</p>
          </div>
          <p className="stats-value">{stats.analyses_count}</p>
        </Card>
        <Card
          as="article"
          className="c-surface c-surface--stack c-surface--accent"
        >
          <div className="o-cluster o-cluster--center">
            <Images size={18} className="stats-icon" />
            <p className="stats-label">Generated outfit images</p>
          </div>
          <p className="stats-value">
            {stats.generated_outfit_images_count ?? stats.outfits_count}
          </p>
        </Card>
        <Card
          as="article"
          className="c-surface c-surface--stack c-surface--accent"
        >
          <div className="o-cluster o-cluster--center">
            <ShirtIcon size={18} className="stats-icon" />
            <p className="stats-label">Items cataloged</p>
          </div>
          <p className="stats-value">{stats.items_count}</p>
        </Card>
      </div>

      <div className="o-grid o-grid--cards">
        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-cluster o-cluster--center">
            <ShirtIcon size={18} />
            <h3>Library totals</h3>
          </div>
          <div className="insight-summary">
            <p>
              Photos analyzed: <strong>{stats.photos_count ?? 0}</strong>
            </p>
            <p>
              Completed analysis: <strong>{stats.analyses_count ?? 0}</strong>
            </p>
            <p>
              Generated outfits:{" "}
              <strong>
                {stats.generated_outfit_images_count ??
                  stats.outfits_count ??
                  0}
              </strong>
            </p>
            <p>
              Items cataloged: <strong>{stats.items_count ?? 0}</strong>
            </p>
          </div>
        </Card>

        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-cluster o-cluster--center">
            <SparklesIcon size={18} />
            <h3>Usage access</h3>
          </div>
          {limitsLoading ? (
            <p className="subtext">Loading usage limits...</p>
          ) : accessMode === "unlimited" ? (
            <p className="subtext">
              Access level: <strong>{userRole}</strong>. AI usage is currently
              unlimited.
            </p>
          ) : trialActive ? (
            <div className="insight-summary">
              <p>
                Today used:{" "}
                <strong>
                  {usedToday}/{dailyLimit}
                </strong>
              </p>
              <p>
                Remaining today: <strong>{remainingToday ?? 0}</strong>
              </p>
              <p>
                Trial days remaining: <strong>{trialDaysRemaining}</strong>
              </p>
            </div>
          ) : (
            <p className="subtext">
              Trial status: <strong>expired</strong>.
            </p>
          )}
        </Card>

        <Card as="article" className="c-surface c-surface--stack">
          <div className="o-cluster o-cluster--center">
            <Clock3 size={18} />
            <h3>Recent activity</h3>
          </div>
          {historyLoading ? (
            <p className="subtext">Loading recent activity...</p>
          ) : recentActions.length === 0 ? (
            <p className="subtext">
              No recent activity yet. Analyze a photo to get started.
            </p>
          ) : (
            <ul className="o-list o-list--split">
              {recentActions.map((entry) => (
                <li key={`recent-action-${entry.job_id}`}>
                  {entry.status ? (
                    <CircleCheckIcon size={14} className="text-green-600" />
                  ) : (
                    <CircleXIcon size={14} className="text-red-600" />
                  )}
                  <span className="subtext">
                    {entry.analysis_model || "Unknown model"} -
                    {entry.created_at
                      ? new Date(entry.created_at).toLocaleString()
                      : "-"}
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
