"use client";

import { FlaskConical, Save, ShieldAlert, Sparkles, Zap } from "lucide-react";
import { UNKNOWN_FIELD_VALUE, type ExtractedFields, type ExtractionSafetyStatus, type FieldConfidenceLevel, type ManualExtractedFields, type ProcessingStatus } from "@/lib/types";
import { processingStatusLabel, processingStatusTone } from "@/lib/qc";
import { FIELD_DISPLAY_LABELS } from "@/lib/fieldExtraction";
import { HIGH_RISK_EXTRACTED_FIELDS } from "@/lib/transcriptQuality";
import { CheckboxCard, InfoCard, PrimaryButton, SecondaryButton, StatusBadge, WarningCard, type BadgeTone } from "@/components/ui";
import { ScreenHeader } from "@/components/ScreenHeader";

const HIGH_RISK_FIELD_SET = new Set<string>(HIGH_RISK_EXTRACTED_FIELDS);

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
  const effective = editedFields ?? extracted;
  const lowConfidence = effective.confidence_score < 0.7 || effective.missing_fields.length > 0;
  const qcRequired = lowConfidence || Boolean(editedFields) || extractionSafetyStatus === "draft_review_required";
  const anyFieldRequiresReview = Boolean(effective.field_confidence && Object.values(effective.field_confidence).some((meta) => meta?.requiresReview));

  // Compact "X ready · Y need review · Z unknown" counts so a review pass
  // with several genuinely-unknown fields reads as a quick scan, not a wall
  // of identical warning cards — the fields themselves stay fully visible
  // below (still editable, still show evidence) for the ones that need it.
  const fieldKeys = Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>;
  const fieldConfidences = fieldKeys.map((key) => effective.field_confidence?.[key]);
  const unknownCount = fieldConfidences.filter((meta) => (meta?.confidence ?? "unknown") === "unknown").length;
  const reviewCount = fieldConfidences.filter((meta) => meta && meta.confidence !== "unknown" && meta.requiresReview).length;
  const readyCount = fieldConfidences.filter((meta) => meta && meta.confidence !== "unknown" && !meta.requiresReview).length;

  return (
    <section>
      <ScreenHeader title="Review captured fields" subtitle={clientId} onBack={onBackToTranscript} isOnline={isOnline} />

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <StatusBadge label={processingStatusLabel(processingStatus)} tone={processingStatusTone(processingStatus)} />
        <span className={`status-pill normal-case tracking-normal ${lowConfidence ? "badge-warn" : "badge-good"}`}>
          <Zap className="h-3.5 w-3.5" />
          Capture confidence: {Math.round(effective.confidence_score * 100)}%
        </span>
        {editedFields && <StatusBadge label="Edited — verify in QC" tone="warn" />}
        {demoHelperUsed && <StatusBadge label="Demo helper used — review required" tone="danger" icon={<FlaskConical className="h-3.5 w-3.5" />} />}
        {/* processingStatusLabel already reads "Needs QC" in danger tone once processingStatus is "needs_qc" — only add this badge when it says something else (e.g. a not-yet-processed draft) so the same risk isn't shown twice. */}
        {qcRequired && processingStatus !== "needs_qc" && <StatusBadge label="Needs QC" tone="danger" />}
      </div>

      <p className="mb-5 text-sm opacity-70">
        Auto-filled from transcript. Please confirm before saving. <span className="font-bold text-[var(--good)]">{readyCount} ready</span> ·{" "}
        <span className="font-bold text-[var(--gold)]">{reviewCount} need review</span> ·{" "}
        <span className="font-bold opacity-80">{unknownCount} unknown</span>
      </p>

      {extractionSafetyStatus === "draft_review_required" && (
        <div className="mb-5">
          <WarningCard icon={<ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}>
            Draft extraction — requires review. These fields were drafted from a transcript flagged with quality or
            translation risk; verify each one against the audio before treating it as correct.
          </WarningCard>
        </div>
      )}

      <SecondaryButton fullWidth icon={<Sparkles className="h-4 w-4" />} onClick={onAutoFill}>
        Auto-fill from transcript
      </SecondaryButton>
      {autoFillSummary && (
        <div className="mt-3">
          <InfoCard>{autoFillSummary}</InfoCard>
        </div>
      )}

      <div className="mt-5 space-y-4">
        {(Object.keys(FIELD_DISPLAY_LABELS) as Array<keyof ManualExtractedFields>).map((key) => {
          const missing = effective.missing_fields.includes(key);
          const fieldMeta = effective.field_confidence?.[key];
          const flagConfidence = fieldMeta && (fieldMeta.confidence === "low" || fieldMeta.confidence === "unknown");
          const isHighRisk = HIGH_RISK_FIELD_SET.has(key);
          return (
            <label key={key} className={`block ${missing || flagConfidence ? "rounded-2xl border border-yellow-300/60 bg-yellow-200/10 p-3" : ""}`}>
              <span className="field-label flex flex-wrap items-center gap-2">
                {FIELD_DISPLAY_LABELS[key]}
                {isHighRisk && <StatusBadge label="High-risk field" tone="neutral" icon={<ShieldAlert className="h-3.5 w-3.5" />} />}
              </span>
              <input
                className="field-input"
                value={effective[key] === UNKNOWN_FIELD_VALUE ? "" : effective[key]}
                placeholder={missing ? "Not captured" : undefined}
                onChange={(event) => onEditField(key, event.target.value)}
              />
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                {fieldMeta && <StatusBadge label={`Source: ${SOURCE_LABELS[fieldMeta.source]}`} tone="neutral" />}
                {/* "Confidence: unknown" next to "Source: Not captured" says the same thing twice — only show confidence when there is actually a captured value to rate. */}
                {fieldMeta && fieldMeta.confidence !== "unknown" && (
                  <StatusBadge label={`Confidence: ${fieldMeta.confidence}`} tone={CONFIDENCE_TONE[fieldMeta.confidence]} />
                )}
                {fieldMeta && (fieldMeta.requiresReview ? <StatusBadge label="Review required" tone="warn" /> : <StatusBadge label="Ready" tone="good" />)}
              </div>
              {fieldMeta?.evidence && <p className="mt-1 text-xs opacity-60">Evidence: &ldquo;{fieldMeta.evidence}&rdquo;</p>}
              {missing && isHighRisk ? (
                <p className="mt-1 text-xs opacity-60">Not captured from transcript — enter manually or leave for QC.</p>
              ) : (
                fieldMeta?.reason && flagConfidence && <p className="mt-1 text-xs opacity-60">{fieldMeta.reason}</p>
              )}
              {fieldSuggestions[key] && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-field-line bg-field-surface p-2 text-xs">
                  <span className="opacity-80">
                    Transcript suggests: <span className="font-bold">{fieldSuggestions[key]}</span>
                  </span>
                  <button
                    type="button"
                    className="font-bold text-[var(--gold)] underline-offset-2 hover:underline"
                    onClick={(event) => {
                      event.preventDefault();
                      onUseSuggestion(key);
                    }}
                  >
                    Use suggestion
                  </button>
                </div>
              )}
            </label>
          );
        })}
      </div>

      <div className="mt-5">
        <InfoCard>Editing fields does not change the source transcript. Edited fields are flagged for QC review.</InfoCard>
      </div>

      <div className="mt-5">
        <CheckboxCard checked={fieldsReviewedConfirmed} onToggle={onToggleFieldsReviewed} label="Fields reviewed — I have checked these values against the recording." />
        {!fieldsReviewedConfirmed && anyFieldRequiresReview && (
          <p className="mt-2 text-xs opacity-60">Confirm captured fields have been reviewed before saving — this record will stay in QC until then.</p>
        )}
      </div>

      <PrimaryButton fullWidth className="mt-6" icon={<Save className="h-5 w-5" />} onClick={onSave}>
        Save record
      </PrimaryButton>
      <SecondaryButton fullWidth className="mt-3" onClick={onBackToTranscript}>
        Back to transcript
      </SecondaryButton>
    </section>
  );
}
