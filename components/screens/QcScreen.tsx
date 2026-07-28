"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Eye, SearchX } from "lucide-react";
import { UNKNOWN_FIELD_VALUE, type ExtractedFields, type FieldConfidence, type ManualExtractedFields, type ProcessingStatus, type RecordingStatus, type TestRecord } from "@/lib/types";
import { filterRecords, qcFilters, qcReviewIssues, qcStatusLabel, syncStatusLabel, type QcFilter, type QcIssue, type QcIssueSeverity } from "@/lib/qc";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { ConfirmDialog, Disclosure, DetailModal, EmptyState, PrimaryButton, SecondaryButton, StatusDot, TextAreaField, TranscriptTab, type StatusDotTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";
import { HighlightedTranscript } from "@/components/TranscriptHighlight";

const RISK_TONE: Record<"low" | "medium" | "high", StatusDotTone> = { low: "good", medium: "warn", high: "danger" };
const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript" | "unknown", string> = {
  manual: "Manual entry",
  transcript: "Auto-filled from transcript",
  corrected_transcript: "Auto-filled from corrected transcript",
  unknown: "Not captured"
};

const ISSUE_SEVERITY_TONE: Record<QcIssueSeverity, StatusDotTone> = { high: "danger", medium: "warn", low: "neutral" };
const ISSUE_SEVERITY_LABEL: Record<QcIssueSeverity, string> = { high: "High", medium: "Medium", low: "Low" };

/** Human-readable "recording mode" for the compact record header — RecordingStatus stays the machine-readable enum, this is display-only. */
const RECORDING_MODE_LABELS: Record<RecordingStatus, string> = {
  recorded: "Recorded",
  failed: "Mic failed",
  not_recorded: "Not recorded",
  manual_override: "Manual override"
};

const NO_EVIDENCE_MESSAGE = "No transcript evidence found — manual review required.";

/** Reviewer-facing per-field status vocabulary (spec: Captured / Missing / Check / Edited) — distinct from FieldConfidence.source/confidence, which stay the machine-readable signal underneath. */
type QcFieldStatus = "Captured" | "Missing" | "Check" | "Edited";
const QC_FIELD_STATUS_TONE: Record<QcFieldStatus, StatusDotTone> = { Captured: "good", Missing: "warn", Check: "warn", Edited: "neutral" };

function deriveQcFieldStatus(meta: FieldConfidence | undefined): QcFieldStatus {
  if (!meta || !meta.value.trim() || meta.value === UNKNOWN_FIELD_VALUE) return "Missing";
  if (meta.source === "manual") return "Edited";
  if (meta.requiresReview) return "Check";
  return "Captured";
}

/** The 7 fields the QC reviewer works through (spec) — additional_notes is free text, never extracted, so it's excluded here same as CapturedFieldsScreen. */
const QC_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "cataract_history_confirmed",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
];

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
  /** "Mark reviewed" always requires an explicit confirmation step, even after opening the full record — never a single accidental tap. */
  const [confirmingReview, setConfirmingReview] = useState(false);
  /** Transcript phrase to highlight/scroll to in the transcript panel — set when the reviewer opens a specific QC issue or captured field, cleared on record change or modal close. */
  const [focusPhrase, setFocusPhrase] = useState<string | undefined>(undefined);
  /** True right after the reviewer tried to jump to evidence that doesn't exist — shows the honest "No transcript evidence found" banner instead of silently doing nothing. */
  const [noEvidenceNotice, setNoEvidenceNotice] = useState(false);
  /** Inline transcript tab on the default QC layout — collapsed until the reviewer expands it or clicks an issue. Pure presentation state. */
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  /** Field the last-clicked issue is about, shown for correction directly under the inline transcript — null when the issue has no single field. */
  const [activeIssueFieldKey, setActiveIssueFieldKey] = useState<keyof ManualExtractedFields | null>(null);
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
    setFocusPhrase(undefined);
    setNoEvidenceNotice(false);
    setTranscriptExpanded(false);
    setActiveIssueFieldKey(null);
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

  /**
   * Jumps to a piece of transcript evidence — used by both a captured
   * field's "Jump to transcript" action and a QC issue's "Review evidence"
   * action. When there's genuinely nothing to jump to, this shows the honest
   * "No transcript evidence found" banner instead of doing nothing, so a tap
   * on "Glasses selected" with no evidence still tells the reviewer
   * something happened.
   */
  function jumpToEvidence(evidenceText: string | undefined) {
    if (evidenceText) {
      setFocusPhrase(evidenceText);
      setNoEvidenceNotice(false);
    } else {
      setFocusPhrase(undefined);
      setNoEvidenceNotice(true);
    }
  }

  /**
   * Issue click → expand the inline transcript tab and highlight that
   * issue's evidence (or show the honest no-evidence banner), with the
   * issue's field editable right under the transcript. The full-record
   * workspace stays one tap away via "Review evidence" — and is still the
   * required step before "Mark reviewed".
   */
  function openIssue(issue: QcIssue) {
    setTranscriptExpanded(true);
    setActiveIssueFieldKey(issue.fieldKey ?? null);
    jumpToEvidence(issue.evidenceText);
  }

  function closeFullRecord() {
    setDetailOpen(false);
    setFocusPhrase(undefined);
    setNoEvidenceNotice(false);
  }

  function requestMarkComplete() {
    setConfirmingReview(true);
  }

  function confirmMarkComplete() {
    setConfirmingReview(false);
    if (selected) markComplete(selected);
  }

  return (
    <OneScreenShell
      header={<CompactHeader title="QC Review" onBack={onBack} isOnline={isOnline} />}
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          {selected && !isApproved ? (
            hasOpenedSelected ? (
              <>
                <PrimaryButton fullWidth className="py-2.5 text-sm" icon={<CheckCircle2 className="h-4 w-4" />} onClick={requestMarkComplete}>
                  Mark reviewed
                </PrimaryButton>
                <SecondaryButton fullWidth className="py-2 text-sm" onClick={onBack}>
                  Keep in QC
                </SecondaryButton>
              </>
            ) : (
              <>
                <PrimaryButton fullWidth className="py-2.5 text-sm" icon={<Eye className="h-4 w-4" />} onClick={openFullRecord}>
                  Review evidence
                </PrimaryButton>
                <SecondaryButton fullWidth className="py-2 text-sm" onClick={onBack}>
                  Keep in QC
                </SecondaryButton>
                {/* Hidden on short viewports (see globals.css @media max-height:700px) — the shell clips rather than scrolls, and the two button labels already say what to do without this line. */}
                <p className="qc-review-hint text-center text-[11px] opacity-60">Open the full record before marking it reviewed.</p>
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
                <dt className="opacity-60">Capture confidence</dt>
                <dd className="font-semibold">{Math.round(selected.confidence_score * 100)}%</dd>
                <dt className="opacity-60">Storage</dt>
                <dd className="font-semibold">{syncStatusLabel(selected.sync_status)}</dd>
                <dt className="opacity-60">Recording mode</dt>
                <dd className="font-semibold">{RECORDING_MODE_LABELS[selected.recording_status]}</dd>
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
                      <StatusDot label={ISSUE_SEVERITY_LABEL[issue.severity]} tone={ISSUE_SEVERITY_TONE[issue.severity]} className="mt-0.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug">{issue.title}</p>
                        <p className="mt-0.5 text-xs leading-snug opacity-70">{issue.detail}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-semibold opacity-50">{issue.source}</span>
                          <button
                            type="button"
                            className="text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                            onClick={() => openIssue(issue)}
                          >
                            Review evidence →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Transcript — supporting evidence, collapsed by default. An
                issue click expands it, highlights the evidence, and puts the
                related field right underneath for correction. */}
            {(() => {
              const qcLineCount = selected.transcript_segments.filter((segment) => segment.isFinal && segment.text.trim()).length;
              const activeFieldStatus = activeIssueFieldKey ? deriveQcFieldStatus(effective.field_confidence?.[activeIssueFieldKey]) : null;
              return (
                <div className="shrink-0">
                  <TranscriptTab
                    subtitle={qcLineCount > 0 ? `${qcLineCount} line${qcLineCount === 1 ? "" : "s"} captured` : "Full text"}
                    expanded={transcriptExpanded}
                    onToggle={() => setTranscriptExpanded((value) => !value)}
                    maxHeightClass="max-h-36"
                    collapsedPreview={
                      selected.corrected_transcript_text.trim() ? (
                        <p className="line-clamp-2 text-sm leading-snug opacity-90">{selected.corrected_transcript_text}</p>
                      ) : undefined
                    }
                  >
                    {noEvidenceNotice && (
                      <div className="mb-2 flex items-center gap-2 rounded-xl border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]">
                        <SearchX className="h-4 w-4 shrink-0" />
                        {NO_EVIDENCE_MESSAGE}
                      </div>
                    )}
                    <div className="text-sm">
                      <HighlightedTranscript
                        text={selected.corrected_transcript_text.trim() ? selected.corrected_transcript_text : selected.raw_transcript_text}
                        focusPhrase={focusPhrase}
                      />
                    </div>
                    {activeIssueFieldKey && (
                      <div className="mt-2 rounded-xl border border-field-line bg-field-surface p-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <span className="text-xs font-bold opacity-90">{FIELD_DISPLAY_LABELS[activeIssueFieldKey]}</span>
                          {activeFieldStatus && <StatusDot label={activeFieldStatus} tone={QC_FIELD_STATUS_TONE[activeFieldStatus]} className="shrink-0" />}
                        </div>
                        <TextAreaField
                          label={FIELD_DISPLAY_LABELS[activeIssueFieldKey]}
                          hideLabel
                          value={effective[activeIssueFieldKey] === UNKNOWN_FIELD_VALUE ? "" : String(effective[activeIssueFieldKey])}
                          placeholder="Not captured"
                          onChange={(event) => updateRecord(selected, { [activeIssueFieldKey]: event.target.value } as Partial<ExtractedFields>)}
                          rows={2}
                        />
                        <p className="mt-1 text-[11px] opacity-60">Editing marks this field Edited and keeps the record in QC for verification.</p>
                      </div>
                    )}
                  </TranscriptTab>
                </div>
              );
            })()}
          </>
        )}
      </div>

      {selected && effective && (
        <DetailModal open={detailOpen} title={`Review — ${selected.client_id}`} onClose={closeFullRecord}>
          <div className="space-y-5">
            {selected.manual_override_reason.trim() && (
              <div className="rounded-2xl border border-field-line bg-field-surface p-3 text-sm">
                <span className="font-bold">Manual override reason:</span> {selected.manual_override_reason.trim()}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Audio record</p>
                <span className="text-xs font-semibold tabular-nums opacity-70">
                  {`${Math.floor(selected.recording_duration_seconds / 60)
                    .toString()
                    .padStart(2, "0")}:${Math.floor(selected.recording_duration_seconds % 60)
                    .toString()
                    .padStart(2, "0")}`}
                </span>
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

            {noEvidenceNotice && (
              <div className="flex items-center gap-2 rounded-xl border border-[var(--warn-border)] bg-[var(--warn-bg)] px-3 py-2 text-sm text-[var(--warn)]">
                <SearchX className="h-4 w-4 shrink-0" />
                {NO_EVIDENCE_MESSAGE}
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="field-label mb-0">Corrected transcript — where a QC issue jumps to</p>
                {!correctedTranscriptDiffers && <span className="text-[11px] font-semibold opacity-60">Same as processing copy</span>}
              </div>
              <div className="ink-panel mt-2 max-h-56 overflow-y-auto text-sm opacity-90">
                <HighlightedTranscript text={selected.corrected_transcript_text} focusPhrase={focusPhrase} />
              </div>
            </div>

            {/* Raw/English copies are audit context, not the working copy — collapsed so a long recording doesn't triple the modal's scroll length. */}
            <Disclosure label="Original transcript (preserved, read-only)">
              <div className="ink-panel text-sm opacity-90">
                <HighlightedTranscript text={selected.raw_transcript_text} focusPhrase={focusPhrase} />
              </div>
            </Disclosure>

            {selected.english_processing_transcript && (
              <Disclosure label="English processing copy">
                <div className="ink-panel text-sm opacity-90">
                  <HighlightedTranscript text={selected.english_processing_transcript} focusPhrase={focusPhrase} />
                </div>
              </Disclosure>
            )}

            {selected.transcript_segments.length > 0 && (
              <Disclosure label={`Segment timestamps (${selected.transcript_segments.length})`}>
                <div className="space-y-1.5">
                  {selected.transcript_segments
                    .filter((segment) => segment.isFinal && segment.text.trim())
                    .map((segment) => (
                      <p key={segment.id} className="flex items-start gap-2 text-sm opacity-80">
                        <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="tabular-nums opacity-60">
                          {new Date(segment.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                        </span>
                        <span>{segment.text}</span>
                      </p>
                    ))}
                </div>
              </Disclosure>
            )}

            <div>
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <p className="field-label mb-0">Transcript quality</p>
                <StatusDot label={`Risk: ${selected.transcript_quality_risk}`} tone={RISK_TONE[selected.transcript_quality_risk]} />
                {selected.translation_review_required && <StatusDot label="Translation needs review" tone="warn" />}
                {selected.extraction_safety_status === "draft_review_required" && <StatusDot label="Draft extraction — needs review" tone="warn" />}
              </div>
              {selected.transcript_quality_flags.length === 0 ? (
                <p className="text-sm opacity-60">No transcript quality flags were raised for this record.</p>
              ) : (
                <Disclosure label={`Quality flags (${selected.transcript_quality_flags.length})`} defaultOpen>
                  <div className="space-y-3">
                    {selected.transcript_quality_flags.map((flag) => (
                      <div key={flag.id} className="rounded-xl border border-field-line bg-field-surface p-3">
                        <div className="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                          <StatusDot
                            label={flag.type.replaceAll("_", " ")}
                            tone={flag.severity === "critical" ? "danger" : flag.severity === "warning" ? "warn" : "neutral"}
                          />
                          {selected.unresolved_transcript_flag_ids.includes(flag.id) ? (
                            <StatusDot label="Unresolved" tone="warn" />
                          ) : (
                            <StatusDot label="Correction applied" tone="good" />
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
              <p className="field-label">Captured fields</p>
              <p className="mb-3 text-xs opacity-60">
                Jump to transcript to check a value against its evidence. Editing a field here marks it Edited and keeps the record in QC for
                verification.
              </p>
              <div className="space-y-3">
                {QC_FIELD_ORDER.map((key) => {
                  const missing = selected.missing_fields.includes(key);
                  const fieldMeta = effective.field_confidence?.[key];
                  const status = deriveQcFieldStatus(fieldMeta);
                  return (
                    <div key={key} className={missing ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-xs font-bold opacity-90">{FIELD_DISPLAY_LABELS[key]}</span>
                        <StatusDot label={status} tone={QC_FIELD_STATUS_TONE[status]} className="shrink-0" />
                      </div>
                      <TextAreaField
                        label={FIELD_DISPLAY_LABELS[key]}
                        hideLabel
                        value={effective[key] === UNKNOWN_FIELD_VALUE ? "" : String(effective[key])}
                        placeholder={missing ? "Not captured" : undefined}
                        onChange={(event) => updateRecord(selected, { [key]: event.target.value } as Partial<ExtractedFields>)}
                        rows={2}
                      />
                      {/* Source + capture confidence stay as small detail text (QC triage is where confidence is operationally useful), never as chips. */}
                      {fieldMeta && (
                        <p className="mt-1 text-[11px] opacity-60">
                          {SOURCE_LABELS[fieldMeta.source]}
                          {fieldMeta.confidence !== "unknown" && ` · ${fieldMeta.confidence} confidence`}
                        </p>
                      )}
                      {fieldMeta?.evidence ? (
                        <button
                          type="button"
                          className="mt-1 line-clamp-1 text-left text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                          onClick={() => jumpToEvidence(fieldMeta.evidence)}
                        >
                          Jump to transcript: &ldquo;{fieldMeta.evidence}&rdquo;
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="mt-1 flex items-center gap-1 text-left text-xs font-semibold opacity-60 hover:opacity-90"
                          onClick={() => jumpToEvidence(undefined)}
                        >
                          <SearchX className="h-3.5 w-3.5 shrink-0" />
                          No transcript evidence for this field
                        </button>
                      )}
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
              <PrimaryButton fullWidth icon={<CheckCircle2 className="h-5 w-5" />} onClick={requestMarkComplete}>
                Mark reviewed
              </PrimaryButton>
            ) : (
              <StatusDot label="QC complete" tone="good" />
            )}
          </div>
        </DetailModal>
      )}

      <ConfirmDialog
        open={confirmingReview}
        title="Mark this record reviewed?"
        body="Confirm you have reviewed the transcript, captured fields and QC reasons."
        confirmLabel="Yes, mark reviewed"
        onConfirm={confirmMarkComplete}
        onCancel={() => setConfirmingReview(false)}
      />
    </OneScreenShell>
  );
}
