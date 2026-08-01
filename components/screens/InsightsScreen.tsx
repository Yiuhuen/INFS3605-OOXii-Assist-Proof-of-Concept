"use client";

import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import type { TestRecord } from "@/lib/types";
import { computeInsights, type ActionableInsight, type InsightTargetPage } from "@/lib/insights";
import { Disclosure, EmptyState, SecondaryButton, StatusDot, type StatusDotTone } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const priorityTone: Record<ActionableInsight["priority"], StatusDotTone> = {
  High: "danger",
  Medium: "warn",
  Low: "neutral"
};

/**
 * One operational issue row — issue, implication, recommended action, and
 * where to act. Flat rows, not metric cards: this screen exists to queue
 * work (QC backlog, missing cataract history, pending sync), never to
 * present diagnostic or medical conclusions.
 */
export function InsightCard({ insight, onNavigate }: { insight: ActionableInsight; onNavigate?: (target: InsightTargetPage) => void }) {
  return (
    <div className="border-b border-field-line py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-bold leading-snug">{insight.title}</p>
        <StatusDot label={insight.priority} tone={priorityTone[insight.priority]} className="mt-0.5 shrink-0" />
      </div>
      <p className="mt-1 text-xs opacity-70">{insight.evidence}</p>
      <p className="mt-1 text-xs opacity-90">{insight.action}</p>
      {onNavigate && (
        <button
          className="mt-1.5 flex min-h-[2rem] items-center gap-1 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
          onClick={() => onNavigate(insight.targetPage)}
        >
          {insight.targetPage === "QC" ? "Review in QC" : `Go to ${insight.targetPage}`}
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
      <p className="mb-4 text-sm opacity-70">
        Operational issues across saved records — for spotting training or process gaps, not for diagnosing individual
        clients. No names, DOB, phone, address or GPS.
      </p>

      {insights.totalRecords === 0 ? (
        <EmptyState title="No records yet" detail="Issues to act on appear here as tests are saved." />
      ) : (
        <>
          <p className="mb-1 text-xs opacity-60">
            {insights.totalRecords} record{insights.totalRecords === 1 ? "" : "s"} · {insights.needsQcCount} need
            {insights.needsQcCount === 1 ? "s" : ""} QC · {insights.pendingSyncCount} pending sync
          </p>
          <div className="mb-4 rounded-xl border border-field-line bg-field-card px-3">
            {insights.insights.map((insight) => (
              <InsightCard key={insight.id} insight={insight} onNavigate={onNavigate} />
            ))}
          </div>

          {(insights.bySite.length > 0 || insights.byLanguage.length > 0) && (
            <div className="mb-4">
              <Disclosure label="Breakdown by site and language">
                <div className="space-y-3">
                  {insights.bySite.map((site) => (
                    <p key={`site-${site.key}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="opacity-80">{site.key}</span>
                      <span className="font-semibold">
                        {site.totalRecords} total · {site.needsQcCount} need QC
                      </span>
                    </p>
                  ))}
                  {insights.byLanguage.map((language) => (
                    <p key={`lang-${language.key}`} className="flex items-center justify-between gap-3 text-sm">
                      <span className="opacity-80">{language.key}</span>
                      <span className="font-semibold">
                        {language.totalRecords} total · {language.needsQcCount} need QC
                      </span>
                    </p>
                  ))}
                </div>
              </Disclosure>
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
