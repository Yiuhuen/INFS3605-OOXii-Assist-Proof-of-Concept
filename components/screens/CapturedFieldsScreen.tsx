"use client";

import { useState } from "react";
import { Save, ScrollText, ShieldAlert, Sparkles } from "lucide-react";
import { UNKNOWN_FIELD_VALUE, type ExtractedFields, type ExtractionSafetyStatus, type FieldConfidence, type ManualExtractedFields } from "@/lib/types";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import { CheckboxCard, DetailModal, InfoCard, PrimaryButton, SecondaryButton, StatusDot, WarningCard, type StatusDotTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";
import { HighlightedTranscript } from "@/components/TranscriptHighlight";

const HIGH_RISK_FIELD_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

/** The 6 fields shown by default — the rest (cataract history confirmed, additional notes) appear in the "Show all fields" detail. */
const KEY_FIELD_ORDER: Array<keyof ManualExtractedFields> = [
  "current_glasses",
  "right_eye_distance_result",
  "left_eye_distance_result",
  "final_readable_line",
  "comfort_response",
  "glasses_selected"
];

/** Review priority (spec §8): not-captured fields first, then anything still needing a look, then everything else — so a reviewer clears the gaps before skimming what's already settled. */
const REVIEW_PRIORITY: Record<"unknown" | "needs_review" | "other", number> = { unknown: 0, needs_review: 1, other: 2 };

const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript" | "unknown", string> = {
  manual: "Manual entry",
  transcript: "Auto-filled from transcript",
  corrected_transcript: "Auto-filled from corrected transcript",
  unknown: "Not captured"
};

/**
 * Honest per-field review status — the load-bearing distinction this screen
 * exists for. "A value exists" is never enough to look done:
 *
 * - "suggested": auto-filled from the transcript, not yet confirmed by the
 *   tester. Extracted fields DEFAULT here, no matter how confident the
 *   extraction was — a clean regex match is still a draft.
 * - "reviewed": the tester has explicitly confirmed the fields ("Confirm all
 *   fields reviewed" below). Only then may a field read as settled.
 * - "needs_review": low/medium confidence, contradiction, misheard alias, or
 *   any other requiresReview signal from lib/fieldExtraction.ts.
 * - "manual": the tester typed this value themselves after extraction —
 *   shown as its own status, never dressed up as a transcript-backed value.
 * - "unknown": nothing captured.
 */
type FieldReviewStatus = "suggested" | "reviewed" | "needs_review" | "manual" | "unknown";

/** Closed status vocabulary (spec): Captured / Reviewed / Check / Edited / Missing — one dot per row, sentence case. */
const STATUS_PRESENTATION: Record<FieldReviewStatus, { label: string; tone: StatusDotTone }> = {
  suggested: { label: "Captured", tone: "neutral" },
  reviewed: { label: "Reviewed", tone: "good" },
  needs_review: { label: "Check", tone: "warn" },
  manual: { label: "Edited", tone: "neutral" },
  unknown: { label: "Missing", tone: "muted" }
};

function deriveFieldStatus(value: string, meta: FieldConfidence | undefined, confirmed: boolean): FieldReviewStatus {
  const hasValue = Boolean(value.trim()) && value !== UNKNOWN_FIELD_VALUE;
  if (!hasValue) return "unknown";
  if (meta?.source === "manual") return "manual";
  if (meta?.requiresReview) return "needs_review";
  return confirmed ? "reviewed" : "suggested";
}

export function CapturedFieldsScreen({
  clientId,
  extracted,
  editedFields,
  isOnline,
  onEditField,
  onBackToTranscript,
  onSave,
  extractionSafetyStatus,
  onAutoFill,
  autoFillSummary,
  fieldsReviewedConfirmed,
  onToggleFieldsReviewed,
  fieldSuggestions,
  onUseSuggestion,
  demoHelperUsed,
  transcriptText
}: {
  clientId: string;
  extracted: ExtractedFields;
  editedFields: ExtractedFields | null;
  isOnline: boolean;
  onEditField: (key: keyof ManualExtractedFields, value: string) => void;
  onBackToTranscript: () => void;
  onSave: () => void;
  /** "draft_review_required" when the transcript/translation this extraction is based on was flagged uncertain — see lib/transcriptQuality.ts deriveExtractionSafetyStatus. */
  extractionSafetyStatus: ExtractionSafetyStatus;
  /** Re-runs draft extraction against the latest corrected transcript — only ever fills fields the tester hasn't hand-edited. */
  onAutoFill: () => void;
  /** e.g. "4 fields suggested, 2 still need review." — set right after onAutoFill runs, null otherwise. */
  autoFillSummary: string | null;
  /** Tester's explicit "Fields reviewed" confirmation — see lib/qc.ts evaluateNeedsQc fieldsRequireReviewUnconfirmed. */
  fieldsReviewedConfirmed: boolean;
  onToggleFieldsReviewed: () => void;
  /** Non-destructive transcript-derived values for fields the tester has already hand-edited — never auto-applied, see app/page.tsx autoFillFromTranscript. */
  fieldSuggestions: Partial<Record<keyof ManualExtractedFields, string>>;
  onUseSuggestion: (key: keyof ManualExtractedFields) => void;
  /** True when the dev/demo-only "Insert sample transcript for demo" helper (lib/demoHelpers.ts) supplied this record's transcript — never set by real recording/STT. */
  demoHelperUsed: boolean;
  /** Corrected transcript (falling back to the English processing copy, then raw) — spec §8: lets a field jump straight to its supporting evidence instead of the tester re-reading/re-listening to the whole recording. */
  transcriptText: string;
}) {
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  /** Field whose evidence is currently spotlighted in the transcript modal (spec §8) — null when the modal is closed. */
  const [evidenceField, setEvidenceField] = useState<keyof ManualExtractedFields | null>(null);
  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields) || extractionSafetyStatus === "draft_review_required";

  const allFieldKeys = Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>;
  // additional_notes is a free-text optional field, never extracted — counting
  // it as perpetually "unknown" would make the summary read scarier than the
  // clinical reality. Every clinical field (the 6 key ones + cataract) counts.
  const countedKeys = allFieldKeys.filter((key) => key !== "additional_notes");
  const statusByKey = new Map<keyof ManualExtractedFields, FieldReviewStatus>(
    countedKeys.map((key) => [key, deriveFieldStatus(String(effective[key] ?? ""), effective.field_confidence?.[key], fieldsReviewedConfirmed)])
  );
  const statuses = [...statusByKey.values()];
  // "Captured" = a value exists and nothing flags it for a check — covers
  // auto-filled, tester-confirmed, and manually entered values. Edited values
  // still carry their own "Edited" row status (and QC flag when high-risk) so
  // they are never mistaken for transcript-backed values.
  const capturedCount = statuses.filter((status) => status === "suggested" || status === "reviewed" || status === "manual").length;
  const editedCount = statuses.filter((status) => status === "manual").length;
  const needsReviewCount = statuses.filter((status) => status === "needs_review").length;
  const unknownCount = statuses.filter((status) => status === "unknown").length;
  const otherFieldKeys = allFieldKeys.filter((key) => !KEY_FIELD_ORDER.includes(key));

  /** Review order (spec §8): not-captured first, then anything needing a look, then everything else — so the reviewer clears gaps before skimming what's already settled. Stable sort preserves each group's original order. */
  function byReviewPriority(a: keyof ManualExtractedFields, b: keyof ManualExtractedFields): number {
    const statusA = statusByKey.get(a);
    const statusB = statusByKey.get(b);
    const priorityA = statusA === "unknown" ? REVIEW_PRIORITY.unknown : statusA === "needs_review" ? REVIEW_PRIORITY.needs_review : REVIEW_PRIORITY.other;
    const priorityB = statusB === "unknown" ? REVIEW_PRIORITY.unknown : statusB === "needs_review" ? REVIEW_PRIORITY.needs_review : REVIEW_PRIORITY.other;
    return priorityA - priorityB;
  }
  const sortedKeyFields = [...KEY_FIELD_ORDER].sort(byReviewPriority);
  const sortedAllFields = [...KEY_FIELD_ORDER, ...otherFieldKeys].sort(byReviewPriority);

  function openTranscriptEvidence(key: keyof ManualExtractedFields) {
    setEvidenceField(key);
  }

  function renderFieldCard(key: keyof ManualExtractedFields) {
    const rawValue = String(effective[key] ?? "");
    const fieldMeta = effective.field_confidence?.[key];
    const status = deriveFieldStatus(rawValue, fieldMeta, fieldsReviewedConfirmed);
    const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
    const hasValue = status !== "unknown";
    const attention = status === "needs_review" || (status === "unknown" && isHighRisk);
    const presentation = STATUS_PRESENTATION[status];

    /** Source + confidence live in this small evidence/detail line, never as separate chips. Confidence only for transcript-derived values — meaningless for a hand-typed entry. */
    const detailParts: string[] = [];
    if (hasValue && fieldMeta) {
      detailParts.push(SOURCE_LABELS[fieldMeta.source]);
      if (fieldMeta.source !== "manual" && fieldMeta.confidence !== "unknown") {
        detailParts.push(`${fieldMeta.confidence} confidence`);
      }
      if (status === "manual" && isHighRisk) detailParts.push("Needs QC");
    }

    return (
      <label
        key={key}
        className={`block rounded-xl border px-3 py-2.5 ${attention ? "border-yellow-300/60 bg-yellow-200/10" : "border-field-line bg-field-card"}`}
      >
        {/* Full label, never ellipsized — "Current glasses" and "Glasses selected / dispensed" must always be distinguishable. Wraps to a second line on narrow screens instead of truncating. One status indicator per row. */}
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold leading-snug opacity-90">{FIELD_DISPLAY_LABELS[key]}</span>
          <StatusDot label={presentation.label} tone={presentation.tone} className="shrink-0" />
        </span>
        <input
          className="field-input mt-1.5 min-h-[2.75rem] px-3 text-sm"
          value={rawValue === UNKNOWN_FIELD_VALUE ? "" : rawValue}
          placeholder={hasValue ? undefined : "Not captured"}
          onChange={(event) => onEditField(key, event.target.value)}
        />
        {detailParts.length > 0 && <p className="mt-1 text-[11px] opacity-60">{detailParts.join(" · ")}</p>}
        {fieldMeta?.evidence && hasValue && (
          <button
            type="button"
            className="mt-1 flex w-full items-center gap-1 text-left text-[11px] font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              openTranscriptEvidence(key);
            }}
            title="Jump to this evidence in the transcript"
          >
            <ScrollText className="h-3 w-3 shrink-0" />
            <span className="line-clamp-1 break-words">View in transcript: &ldquo;{fieldMeta.evidence}&rdquo;</span>
          </button>
        )}
        {status === "unknown" && (
          <p className="mt-1 text-[11px] opacity-60">No transcript evidence found — enter manually or leave for QC.</p>
        )}
        {status !== "unknown" && fieldMeta?.reason && <p className="mt-1 text-[11px] opacity-60">{fieldMeta.reason}</p>}
        {fieldSuggestions[key] && (
          <button
            type="button"
            className="mt-1 line-clamp-1 text-left text-[11px] font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={(event) => {
              event.preventDefault();
              onUseSuggestion(key);
            }}
          >
            Use suggestion: {fieldSuggestions[key]}
          </button>
        )}
      </label>
    );
  }

  return (
    <OneScreenShell
      header={<CompactHeader title="Review captured fields" subtitle={clientId} onBack={onBackToTranscript} isOnline={isOnline} />}
      footer={
        <BottomActionBar className="flex-col items-stretch gap-2">
          <CheckboxCard
            checked={fieldsReviewedConfirmed}
            onToggle={onToggleFieldsReviewed}
            label="Confirm all fields reviewed — checked against the recording."
          />
          <PrimaryButton
            fullWidth
            className="py-2.5 text-sm"
            icon={<Save className="h-4 w-4" />}
            onClick={onSave}
            disabled={!fieldsReviewedConfirmed}
          >
            Save record
          </PrimaryButton>
          {!fieldsReviewedConfirmed && (
            <p className="text-center text-[11px] opacity-60">Confirm the fields above to enable saving. Fields flagged for QC stay flagged after saving.</p>
          )}
        </BottomActionBar>
      }
    >
      <div className="flex h-full min-h-0 flex-col gap-2 overflow-y-auto">
        {/* Plain-text summary — concrete counts, no confidence pill, no badge
            row. Capture confidence stays in the export/audit metadata and QC
            triage, where it is operationally useful. */}
        <div className="shrink-0">
          <p className="text-sm font-bold">
            {capturedCount} captured · {unknownCount} missing · {needsReviewCount} check
            {editedCount > 0 && ` · ${editedCount} edited`}
          </p>
          <p className="mt-0.5 text-[11px] opacity-60">
            Draft fields from the transcript — confirm before saving.
            {qcRequired && " This record stays flagged for QC after saving."}
            {demoHelperUsed && " Demo transcript in use."}
          </p>
        </div>

        {extractionSafetyStatus === "draft_review_required" && (
          <div className="shrink-0">
            <WarningCard icon={<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}>
              <span className="line-clamp-2">Draft extraction from a flagged transcript — verify each field against the audio.</span>
            </WarningCard>
          </div>
        )}

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <SecondaryButton className="min-h-[2.75rem] py-1.5 text-xs" icon={<Sparkles className="h-3.5 w-3.5" />} onClick={onAutoFill}>
            Auto-fill from transcript
          </SecondaryButton>
          <button
            className="min-h-[2.75rem] px-2 text-xs font-bold text-[var(--gold)] underline-offset-2 hover:underline"
            onClick={() => setAllFieldsOpen(true)}
          >
            Show all fields
          </button>
        </div>
        {autoFillSummary && (
          <div className="shrink-0">
            <InfoCard>
              <span className="line-clamp-1">{autoFillSummary}</span>
            </InfoCard>
          </div>
        )}

        {/* Single column on phones — two-column card grids truncated the
            safety-critical labels ("Current…" vs "Glasses…") that tell the
            tester which glasses question they are answering. Two columns only
            from sm (640px) up, where full labels fit without ellipsis. */}
        <div className="grid shrink-0 grid-cols-1 content-start gap-2 sm:grid-cols-2">
          {sortedKeyFields.map((key) => renderFieldCard(key))}
        </div>
      </div>

      <DetailModal open={allFieldsOpen} title="All captured fields" onClose={() => setAllFieldsOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs opacity-70">Editing fields does not change the source transcript. Edited fields are flagged for QC review.</p>
          {sortedAllFields.map((key) => renderFieldCard(key))}
        </div>
      </DetailModal>

      <DetailModal
        open={evidenceField !== null}
        title={evidenceField ? `Transcript — ${FIELD_DISPLAY_LABELS[evidenceField]}` : "Transcript"}
        onClose={() => setEvidenceField(null)}
      >
        <div className="space-y-3">
          <p className="text-xs opacity-70">
            Highlighted phrase is the evidence for this field — no need to re-read the whole recording.
          </p>
          <div className="ink-panel text-sm">
            <HighlightedTranscript text={transcriptText} focusPhrase={evidenceField ? effective.field_confidence?.[evidenceField]?.evidence : undefined} />
          </div>
        </div>
      </DetailModal>
    </OneScreenShell>
  );
}
