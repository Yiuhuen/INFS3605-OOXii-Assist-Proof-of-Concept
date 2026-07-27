"use client";

import { useState } from "react";
import { FlaskConical, PencilLine, Save, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { UNKNOWN_FIELD_VALUE, type ExtractedFields, type ExtractionSafetyStatus, type FieldConfidence, type FieldConfidenceLevel, type ManualExtractedFields, type ProcessingStatus } from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import { CheckboxCard, DetailModal, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, WarningCard, type BadgeTone } from "@/components/ui";
import { OneScreenShell, CompactHeader, BottomActionBar } from "@/components/layout/OneScreenShell";

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

const SOURCE_LABELS: Record<"manual" | "transcript" | "corrected_transcript" | "unknown", string> = {
  manual: "Manual entry",
  transcript: "Transcript",
  corrected_transcript: "Corrected transcript",
  unknown: "Not captured"
};

const CONFIDENCE_TONE: Record<FieldConfidenceLevel, BadgeTone> = {
  high: "good",
  medium: "neutral",
  low: "warn",
  unknown: "warn"
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

const STATUS_PRESENTATION: Record<FieldReviewStatus, { label: string; tone: BadgeTone }> = {
  suggested: { label: "Suggested", tone: "neutral" },
  reviewed: { label: "Reviewed", tone: "good" },
  needs_review: { label: "Needs review", tone: "warn" },
  manual: { label: "Manual edit", tone: "warn" },
  unknown: { label: "Unknown", tone: "neutral" }
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
  processingStatus,
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
  demoHelperUsed
}: {
  clientId: string;
  extracted: ExtractedFields;
  editedFields: ExtractedFields | null;
  processingStatus: ProcessingStatus;
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
}) {
  const [allFieldsOpen, setAllFieldsOpen] = useState(false);
  /** Which fields' evidence quotes are expanded past the one-line preview. */
  const [expandedEvidence, setExpandedEvidence] = useState<Partial<Record<keyof ManualExtractedFields, boolean>>>({});
  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields) || extractionSafetyStatus === "draft_review_required";

  const allFieldKeys = Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>;
  // additional_notes is a free-text optional field, never extracted — counting
  // it as perpetually "unknown" would make the summary read scarier than the
  // clinical reality. Every clinical field (the 6 key ones + cataract) counts.
  const countedKeys = allFieldKeys.filter((key) => key !== "additional_notes");
  const statusByKey = new Map(
    countedKeys.map((key) => [key, deriveFieldStatus(String(effective[key] ?? ""), effective.field_confidence?.[key], fieldsReviewedConfirmed)])
  );
  const statuses = [...statusByKey.values()];
  const suggestedCount = statuses.filter((status) => status === "suggested").length;
  // A manual entry is by definition tester-reviewed — they typed it. It still
  // carries its own "Manual edit" badge (and QC flag when high-risk) so it is
  // never mistaken for a transcript-backed value.
  const reviewedCount = statuses.filter((status) => status === "reviewed" || status === "manual").length;
  const needsReviewCount = statuses.filter((status) => status === "needs_review").length;
  const unknownCount = statuses.filter((status) => status === "unknown").length;
  const otherFieldKeys = allFieldKeys.filter((key) => !KEY_FIELD_ORDER.includes(key));

  function renderFieldCard(key: keyof ManualExtractedFields) {
    const rawValue = String(effective[key] ?? "");
    const fieldMeta = effective.field_confidence?.[key];
    const status = deriveFieldStatus(rawValue, fieldMeta, fieldsReviewedConfirmed);
    const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
    const hasValue = status !== "unknown";
    const attention = status === "needs_review" || (status === "unknown" && isHighRisk);
    const evidenceExpanded = Boolean(expandedEvidence[key]);
    const presentation = STATUS_PRESENTATION[status];

    return (
      <label
        key={key}
        className={`block rounded-xl border px-3 py-2.5 ${attention ? "border-yellow-300/60 bg-yellow-200/10" : "border-field-line bg-field-card"}`}
      >
        {/* Full label, never ellipsized — "Current glasses" and "Glasses selected / dispensed" must always be distinguishable. Wraps to a second line on narrow screens instead of truncating. */}
        <span className="flex items-start justify-between gap-2">
          <span className="text-xs font-bold leading-snug opacity-90">{FIELD_DISPLAY_LABELS[key]}</span>
          <StatusBadge label={presentation.label} tone={presentation.tone} />
        </span>
        <input
          className="field-input mt-1.5 min-h-[2.75rem] px-3 text-sm"
          value={rawValue === UNKNOWN_FIELD_VALUE ? "" : rawValue}
          placeholder={hasValue ? undefined : "Not captured"}
          onChange={(event) => onEditField(key, event.target.value)}
        />
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[10px]">
          {status === "unknown" && isHighRisk && <StatusBadge label="Needs review" tone="warn" />}
          {status === "manual" && isHighRisk && <StatusBadge label="Needs QC" tone="danger" />}
          {isHighRisk && <StatusBadge label="High-risk" tone="neutral" icon={<ShieldAlert className="h-3 w-3" />} />}
          {/* Source shown only when there is something to attribute — "Source: Not captured" next to an Unknown badge is duplicate noise. */}
          {hasValue && fieldMeta && <StatusBadge label={SOURCE_LABELS[fieldMeta.source]} tone="neutral" icon={fieldMeta.source === "manual" ? <PencilLine className="h-3 w-3" /> : undefined} />}
          {/* Confidence only for transcript-derived values — extraction confidence is meaningless for a hand-typed entry, and "unknown" confidence for an empty field says nothing the Unknown badge doesn't. */}
          {hasValue && fieldMeta && fieldMeta.source !== "manual" && fieldMeta.confidence !== "unknown" && (
            <StatusBadge label={`Confidence: ${fieldMeta.confidence}`} tone={CONFIDENCE_TONE[fieldMeta.confidence]} />
          )}
        </div>
        {fieldMeta?.evidence && hasValue && (
          <button
            type="button"
            className="mt-1 block w-full text-left text-[11px] opacity-70 hover:opacity-100"
            onClick={(event) => {
              event.preventDefault();
              setExpandedEvidence((prev) => ({ ...prev, [key]: !prev[key] }));
            }}
            title={evidenceExpanded ? "Collapse evidence" : "Show full evidence"}
          >
            <span className={evidenceExpanded ? "select-text break-words" : "line-clamp-1 break-words"}>
              Evidence: &ldquo;{fieldMeta.evidence}&rdquo;
            </span>
          </button>
        )}
        {status === "unknown" && (
          <p className="mt-1 text-[11px] opacity-60">
            {fieldMeta?.reason ?? "Not captured from transcript — enter manually or leave for QC."}
          </p>
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
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
          <span className={`status-pill normal-case tracking-normal ${lowConfidence ? "badge-warn" : "badge-good"}`}>
            <Zap className="h-3.5 w-3.5" />
            {Math.round(effective.confidence_score * 100)}%
          </span>
          {demoHelperUsed && <StatusBadge label="Demo helper" tone="danger" icon={<FlaskConical className="h-3.5 w-3.5" />} />}
          {qcRequired && processingStatus !== "needs_qc" && <StatusBadge label="Needs QC" tone="danger" />}
          {/* "Ready to save" appears ONLY after the tester's explicit confirmation — a screen full of extracted values is never "ready" on its own. */}
          {fieldsReviewedConfirmed && <StatusBadge label="Ready to save" tone="good" />}
        </div>

        <div className="shrink-0">
          <p className="text-xs">
            <span className="font-bold opacity-90">{suggestedCount} suggested</span> ·{" "}
            <span className="font-bold text-[var(--good)]">{reviewedCount} reviewed</span> ·{" "}
            <span className="font-bold text-[var(--gold)]">{needsReviewCount} need review</span> ·{" "}
            <span className="font-bold opacity-70">{unknownCount} unknown</span>
          </p>
          <p className="mt-0.5 text-[11px] opacity-60">These are draft fields from the transcript. Confirm before saving.</p>
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
          {KEY_FIELD_ORDER.map((key) => renderFieldCard(key))}
        </div>
      </div>

      <DetailModal open={allFieldsOpen} title="All captured fields" onClose={() => setAllFieldsOpen(false)}>
        <div className="space-y-3">
          <p className="text-xs opacity-70">Editing fields does not change the source transcript. Edited fields are flagged for QC review.</p>
          {[...KEY_FIELD_ORDER, ...otherFieldKeys].map((key) => renderFieldCard(key))}
        </div>
      </DetailModal>
    </OneScreenShell>
  );
}
