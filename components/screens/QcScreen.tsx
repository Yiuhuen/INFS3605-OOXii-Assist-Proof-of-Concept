"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { UNKNOWN_FIELD_VALUE, type ExtractedFields, type FieldConfidenceLevel, type ManualExtractedFields, type ProcessingStatus, type TestRecord } from "@/lib/types";
import {
  filterRecords,
  qcFilters,
  qcReviewIssues,
  qcStatusLabel,
  syncStatusLabel,
  type QcFilter,
  type QcIssue,
  type QcIssueSeverity
} from "@/lib/qc";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import { Disclosure, DetailModal, EmptyState, PrimaryButton, SecondaryButton, StatusBadge, TextAreaField, type BadgeTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

const RISK_TONE: Record<"low" | "medium" | "high", BadgeTone> = { low: "good", medium: "warn", high: "danger" };
const SEVERITY_TONE: Record<"info" | "warning" | "critical", BadgeTone> = { info: "neutral", warning: "warn", critical: "danger" };
const HIGH_RISK_FIELD_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);
const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript" | "unknown", string> = {
  manual: "Manual entry",
  transcript: "Transcript",
  corrected_transcript: "Corrected transcript",
  unknown: "Not captured"
};
const CONFIDENCE_TONE: Record<FieldConfidenceLevel, BadgeTone> = { high: "good", medium: "neutral", low: "warn", unknown: "warn" };

const ISSUE_SEVERITY_TONE: Record<QcIssueSeverity, BadgeTone> = { high: "danger", medium: "warn", low: "neutral" };
const ISSUE_SEVERITY_LABEL: Record<QcIssueSeverity, string> = { high: "High", medium: "Medium", low: "Low" };
const ISSUE_ACTION_LABEL: Record<QcIssue["source"], string> = {
  Field: "Review fields",
  Transcript: "Review transcript",
  Recording: "Review recording",
  Prompt: "Review prompts"
};

/**
 * Reviewer-facing processing copy — more specific than the shared
 * processingStatusLabel. "Not processed" next to "Saved locally" read as
 * "the save failed"; what it actually means is the transcript/manual review
 * work is not finished. Only shown when it adds information the QC line
 * doesn't already carry.
 */
const PROCESSING_SUMMARY_LABELS: Record<ProcessingStatus, string | null> = {
  not_processed: "Transcript/manual review incomplete",
  ready_for_review: "Ready for review",
  needs_qc: null,
  processed_after_sync: "Processed after sync"
};

export function QcScreen({
  records,
  latestRecordId,
  qcAudioUrl,
  isOnline,
  loadQcAudio,
  updateRecord,
  updateNotes,
  markComplete,
  onBack
}: {
  records: TestRecord[];
  latestRecordId: string | null;
  qcAudioUrl: string;
  isOnline: boolean;
  loadQcAudio: (record: TestRecord) => void;
  updateRecord: (record: TestRecord, patch: Partial<ExtractedFields>) => void;
  updateNotes: (record: TestRecord, notes: string) => void;
  markComplete: (record: TestRecord) => void;
  onBack: () => void;
}) {
  const [filter, setFilter] = useState<QcFilter>("needs_qc");
  const filtered = useMemo(() => filterRecords(records, filter), [records, filter]);
  const [selectedId, setSelectedId] = useState(latestRecordId ?? filtered[0]?.id ?? "");
  const [detailOpen, setDetailOpen] = useState(false);
  /** Record ids whose full detail the reviewer has actually opened this session — gates "Mark reviewed" so a problematic record can't be waved through unseen. */
  const [openedRecordIds, setOpenedRecordIds] = useState<Set<string>>(new Set());
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const selectedIndex = selected ? filtered.findIndex((record) => record.id === selected.id) : -1;

  useEffect(() => {
    if (filtered.length === 0) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!filtered.some((record) => record.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  useEffect(() => {
    if (selected) loadQcAudio(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const effective = selected ? selected.edited_extracted_json ?? selected.extracted_json : null;
  const correctedTranscriptDiffers = selected
    ? selected.corrected_transcript_text.trim().length > 0 && selected.corrected_transcript_text.trim() !== selected.raw_transcript_text.trim()
    : false;
  const issues = selected ? qcReviewIssues(selected) : [];
  const hasOpenedSelected = selected ? openedRecordIds.has(selected.id) : false;
  const isApproved = selected?.qc_status === "Approved";
  const processingSummary = selected ? PROCESSING_SUMMARY_LABELS[selected.processing_status] : null;

  function goToOffset(offset: number) {
    if (selectedIndex < 0) return;
    const next = filtered[selectedIndex + offset];
    if (next) setSelectedId(next.id);
  }

  function openFullRecord() {
    if (selected) setOpenedRecordIds((prev) => new Set(prev).add(selected.id));
    setDetailOpen(true);
  }

  return (
    <OneScreenShell
      header={<CompactHeader title="QC Review" onBack={onBack} isOnline={isOnline} />}
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          {selected && !isApproved ? (
            hasOpenedSelected ? (
              <>
                <PrimaryButton fullWidth className="py-2.5 text-sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => markComplete(selected)}>
                  Mark reviewed
                </PrimaryButton>
                <SecondaryButton fullWidth className="py-2 text-sm" onClick={onBack}>
                  Keep in QC
                </SecondaryButton>
              </>
            ) : (
              <>
                <PrimaryButton fullWidth className="py-2.5 text-sm" icon={<Eye className="h-4 w-4" />} onClick={openFullRecord}>
                  Review full record
                </PrimaryButton>
                <SecondaryButton fullWidth className="py-2 text-sm" onClick={onBack}>
                  Keep in QC
                </SecondaryButton>
                <p className="text-center text-[11px] opacity-60">Open the full record before marking it reviewed.</p>
              </>
            )
          ) : (
            <SecondaryButton fullWidth className="py-2.5 text-sm" disabled>
              {selected ? "QC complete" : "No record selected"}
            </SecondaryButton>
          )}
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden">
        {/* Compact segmented filters — wrap instead of clipping, so no tab is ever half-hidden off-screen. */}
        <div className="flex shrink-0 flex-wrap gap-1.5">
          {qcFilters.map((option) => (
            <button
              key={option.id}
              className={`min-h-[2.75rem] rounded-lg px-2.5 text-xs font-bold transition ${
                filter === option.id ? "bg-[var(--gold)] text-[var(--gold-ink)]" : "border border-field-line bg-field-surface text-field-muted hover:bg-field-card"
              }`}
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 || !selected || !effective ? (
          <EmptyState title="No records match this filter" detail="Try a different filter or complete a test first." />
        ) : (
          <>
            {/* Record summary — who am I reviewing, and where does it stand. Labelled values, not naked chips. */}
            <div className="shrink-0 rounded-xl border border-field-line bg-field-card p-3">
              <div className="flex items-center justify-between gap-2">
                <button type="button" className="chip-button px-2.5" onClick={() => goToOffset(-1)} disabled={selectedIndex <= 0} aria-label="Previous record">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <div className="min-w-0 flex-1 text-center">
                  <p className="truncate text-sm font-bold">{selected.client_id}</p>
                  <p className="text-[10px] opacity-60">
                    Record {selectedIndex + 1} of {filtered.length}
                  </p>
                </div>
                <button
                  type="button"
                  className="chip-button px-2.5"
                  onClick={() => goToOffset(1)}
                  disabled={selectedIndex >= filtered.length - 1}
                  aria-label="Next record"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                <dt className="opacity-60">QC status</dt>
                <dd className={`font-semibold ${isApproved ? "text-[var(--good)]" : "text-[var(--warn)]"}`}>{qcStatusLabel(selected.qc_status)}</dd>
                <dt className="opacity-60">Completeness</dt>
                <dd className="font-semibold">{Math.round(selected.confidence_score * 100)}%</dd>
                <dt className="opacity-60">Storage</dt>
                <dd className="font-semibold">{syncStatusLabel(selected.sync_status)}</dd>
                {processingSummary && (
                  <>
                    <dt className="opacity-60">Processing</dt>
                    <dd className="font-semibold">{processingSummary}</dd>
                  </>
                )}
              </dl>
            </div>

            {/* Issue checklist — sentence-case rows ranked by severity, never an uppercase badge wall. Scrolls internally when long. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-field-line bg-field-card">
              <p className="shrink-0 border-b border-field-line px-3 py-2 text-xs font-bold">
                {isApproved
                  ? "QC complete — no open issues"
                  : issues.length === 0
                    ? "No specific issues listed — review the full record before approving"
                    : `${issues.length} issue${issues.length === 1 ? "" : "s"} need${issues.length === 1 ? "s" : ""} review`}
              </p>
              <div className="min-h-0 flex-1 divide-y divide-field-line overflow-y-auto">
                {issues.map((issue) => (
                  <div key={issue.id} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <StatusBadge label={ISSUE_SEVERITY_LABEL[issue.severity]} tone={ISSUE_SEVERITY_TONE[issue.severity]} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{issue.title}</p>
                        <p className="mt-0.5 text-xs leading-snug opacity-70">{issue.detail}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wide opacity-50">{issue.source}</span>
                          <button
                            type="button"
                            className="text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                            onClick={openFullRecord}
                          >
                            {ISSUE_ACTION_LABEL[issue.source]} →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {selected && effective && (
        <DetailModal open={detailOpen} title={`Review — ${selected.client_id}`} onClose={() => setDetailOpen(false)}>
          <div className="space-y-5">
            {selected.manual_override_reason.trim() && (
              <div className="rounded-2xl border border-field-line bg-field-surface p-3 text-sm">
                <span className="font-bold">Manual override reason:</span> {selected.manual_override_reason.trim()}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Audio record</p>
                <StatusBadge
                  label={`${Math.floor(selected.recording_duration_seconds / 60)
                    .toString()
                    .padStart(2, "0")}:${Math.floor(selected.recording_duration_seconds % 60)
                    .toString()
                    .padStart(2, "0")}`}
                  tone="neutral"
                />
              </div>
              {qcAudioUrl ? <audio className="mt-2 w-full" controls src={qcAudioUrl} /> : <p className="mt-2 text-sm opacity-60">No audio available for this record.</p>}
            </div>

            {selected.unclear_segments.length > 0 && (
              <div>
                <p className="field-label">Unclear sections ({selected.unclear_segments.length})</p>
                <div className="space-y-1.5">
                  {selected.unclear_segments.map((segment) => (
                    <p key={segment.id} className="text-sm opacity-80">
                      <span className="mr-2 text-xs font-bold tabular-nums opacity-50">
                        {new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      {segment.note}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Original transcript</p>
                <StatusBadge label="Preserved" tone="good" />
              </div>
              <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">{selected.raw_transcript_text}</pre>
            </div>

            {selected.english_processing_transcript && (
              <div>
                <p className="field-label">English processing copy</p>
                <pre className="ink-panel whitespace-pre-wrap text-sm opacity-90">{selected.english_processing_transcript}</pre>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Corrected transcript</p>
                {!correctedTranscriptDiffers && <StatusBadge label="Same as processing copy" tone="neutral" />}
              </div>
              <pre className="ink-panel mt-2 whitespace-pre-wrap text-sm opacity-90">{selected.corrected_transcript_text || "No corrected transcript recorded."}</pre>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="field-label mb-0">Transcript quality</p>
                <StatusBadge label={`Risk: ${selected.transcript_quality_risk}`} tone={RISK_TONE[selected.transcript_quality_risk]} />
                {selected.translation_review_required && <StatusBadge label="Translation requires review" tone="warn" />}
                {selected.extraction_safety_status === "draft_review_required" && <StatusBadge label="Draft extraction — requires review" tone="warn" />}
              </div>
              {selected.transcript_quality_flags.length === 0 ? (
                <p className="text-sm opacity-60">No transcript quality flags were raised for this record.</p>
              ) : (
                <Disclosure label={`Quality flags (${selected.transcript_quality_flags.length})`} defaultOpen>
                  <div className="space-y-3">
                    {selected.transcript_quality_flags.map((flag) => (
                      <div key={flag.id} className="rounded-xl border border-field-line bg-field-surface p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-2">
                          <StatusBadge label={flag.type.replaceAll("_", " ")} tone={SEVERITY_TONE[flag.severity]} />
                          {selected.unresolved_transcript_flag_ids.includes(flag.id) ? (
                            <StatusBadge label="Unresolved" tone="warn" />
                          ) : (
                            <StatusBadge label="Correction applied" tone="good" />
                          )}
                        </div>
                        <p>
                          Detected: &ldquo;{flag.originalText}&rdquo;
                          {flag.suggestedText && (
                            <>
                              {" "}
                              → Suggested: &ldquo;{flag.suggestedText}&rdquo;
                            </>
                          )}
                        </p>
                        <p className="mt-1 text-xs opacity-60">{flag.reason}</p>
                      </div>
                    ))}
                  </div>
                </Disclosure>
              )}
              {selected.corrections_applied.length > 0 && (
                <div className="mt-3">
                  <Disclosure label={`Corrections applied (${selected.corrections_applied.length})`}>
                    <div className="space-y-2">
                      {selected.corrections_applied.map((correction) => (
                        <p key={correction.id} className="text-sm opacity-80">
                          &ldquo;{correction.originalText}&rdquo; → &ldquo;{correction.suggestedText}&rdquo; — applied {new Date(correction.appliedAt).toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {correction.affectsClinicalMeaning && <span className="ml-2 text-xs font-bold text-[var(--danger)]">Clinical</span>}
                        </p>
                      ))}
                    </div>
                  </Disclosure>
                </div>
              )}
            </div>

            <div>
              <p className="field-label">Review captured fields</p>
              <p className="mb-3 text-xs opacity-60">Missing fields are highlighted. Editing here flags the record as edited for verification and marks that field source: manual.</p>
              <div className="space-y-3">
                {(Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).map((key) => {
                  const missing = selected.missing_fields.includes(key);
                  const fieldMeta = effective.field_confidence?.[key];
                  const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
                  return (
                    <div key={key} className={missing ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}>
                      <TextAreaField
                        label={FIELD_DISPLAY_LABELS[key]}
                        value={effective[key] === UNKNOWN_FIELD_VALUE ? "" : String(effective[key])}
                        placeholder={missing ? "Not captured" : undefined}
                        onChange={(event) => updateRecord(selected, { [key]: event.target.value } as Partial<ExtractedFields>)}
                        rows={2}
                      />
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                        {isHighRisk && <StatusBadge label="High-risk field" tone="neutral" />}
                        {fieldMeta && <StatusBadge label={`Source: ${SOURCE_LABELS[fieldMeta.source]}`} tone="neutral" />}
                        {fieldMeta && fieldMeta.confidence !== "unknown" && (
                          <StatusBadge label={`Confidence: ${fieldMeta.confidence}`} tone={CONFIDENCE_TONE[fieldMeta.confidence]} />
                        )}
                        {fieldMeta && (fieldMeta.requiresReview ? <StatusBadge label="Review required" tone="warn" /> : <StatusBadge label="Ready" tone="good" />)}
                      </div>
                      {fieldMeta?.evidence && <p className="mt-1 text-xs opacity-60">Evidence: &ldquo;{fieldMeta.evidence}&rdquo;</p>}
                      {fieldMeta?.reason && (fieldMeta.confidence === "low" || fieldMeta.confidence === "unknown") && (
                        <p className="mt-1 text-xs opacity-60">{fieldMeta.reason}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <TextAreaField
              label="QC notes"
              value={selected.qc_notes}
              onChange={(event) => updateNotes(selected, event.target.value)}
              placeholder="Optional — notes for other reviewers about this record's QC decision"
              rows={2}
            />

            {selected.qc_status !== "Approved" ? (
              <PrimaryButton fullWidth icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => markComplete(selected)}>
                Mark reviewed
              </PrimaryButton>
            ) : (
              <StatusBadge label="QC complete" tone="good" />
            )}
          </div>
        </DetailModal>
      )}
    </OneScreenShell>
  );
}
