"use client";

import { useMemo } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { computeInsights, type ActionableInsight, type InsightTargetPage } from "@/lib/insights";
import { EmptyState, MetricCard, SecondaryButton, StatusBadge } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

function Row({ label, value, tone }: { label: string; value: string; tone?: "warn" | "danger" | "good" | "neutral" }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-field-line py-2.5 text-sm last:border-b-0">
      <span className="opacity-80">{label}</span>
      <StatusBadge label={value} tone={tone ?? "neutral"} />
    </div>
  );
}

const priorityTone: Record<ActionableInsight["priority"], "danger" | "warn" | "neutral"> = {
  High: "danger",
  Medium: "warn",
  Low: "neutral"
};

/** One actionable-insight card: what we saw, why, what to do, and where. Reused on Home, Export, and this full screen. */
export function InsightCard({ insight, onNavigate }: { insight: ActionableInsight; onNavigate?: (target: InsightTargetPage) => void }) {
  return (
    <div className="field-card">
      <div className="flex items-start justify-between gap-3">
        <p className="font-bold leading-snug">{insight.title}</p>
        <StatusBadge label={insight.priority} tone={priorityTone[insight.priority]} />
      </div>
      <p className="mt-2 text-sm opacity-70">{insight.evidence}</p>
      <p className="mt-2 text-sm opacity-90">
        <span className="font-bold">Recommended:</span> {insight.action}
      </p>
      {onNavigate && (
        <button
          className="mt-3 flex items-center gap-1 text-xs font-bold text-[var(--gold)]"
          onClick={() => onNavigate(insight.targetPage)}
        >
          Go to {insight.targetPage}
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function InsightsScreen({
  records,
  isOnline,
  onNavigate,
  onBack
}: {
  records: TestRecord[];
  isOnline: boolean;
  onNavigate: (target: InsightTargetPage) => void;
  onBack: () => void;
}) {
  const insights = useMemo(() => computeInsights(records), [records]);

  return (
    <section>
      <ScreenHeader title="Insights" onBack={onBack} isOnline={isOnline} />
      <p className="mb-5 text-sm opacity-70">
        Actionable insights — aggregate, non-personal patterns across saved records, for spotting training or process
        issues, not for diagnosing individual clients. Nothing here uses a name, DOB, phone, address, or GPS location.
      </p>

      {insights.totalRecords === 0 ? (
        <EmptyState title="No records yet" detail="Actionable insights build up automatically as tests are saved." />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <MetricCard value={insights.totalRecords} label="Total records" />
            <MetricCard value={insights.needsQcCount} label="Needs QC" tone={insights.needsQcCount > 0 ? "danger" : "neutral"} />
            <MetricCard value={`${Math.round(insights.averageConfidence * 100)}%`} label="Avg. capture confidence" />
            <MetricCard
              value={`${Math.round(insights.recordingSuccessRate * 100)}%`}
              label="Recording success rate"
              tone={insights.recordingSuccessRate < 0.8 ? "danger" : "neutral"}
            />
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-wide opacity-60">Actionable insights</p>
          <div className="mb-6 space-y-3">
            {insights.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
            ))}
          </div>

          {insights.bySite.length > 0 && (
            <div className="field-card mb-5">
              <p className="flex items-center gap-2 font-bold">
                <MapPin className="h-4 w-4 text-[var(--gold)]" />
                Records by site
              </p>
              <div className="mt-2">
                {insights.bySite.map((site) => (
                  <Row
                    key={site.key}
                    label={site.key}
                    value={`${site.totalRecords} total · ${site.needsQcCount} need QC`}
                    tone={site.needsQcRate > 0.4 ? "danger" : "neutral"}
                  />
                ))}
              </div>
            </div>
          )}

          {insights.byLanguage.length > 0 && (
            <div className="field-card mb-6">
              <p className="font-bold">Records by language</p>
              <div className="mt-2">
                {insights.byLanguage.map((language) => (
                  <Row key={language.key} label={language.key} value={`${language.totalRecords} total · ${language.needsQcCount} need QC`} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <SecondaryButton fullWidth onClick={onBack}>
        Back to Home
      </SecondaryButton>
    </section>
  );
}
