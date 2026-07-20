/**
 * Single source of truth for "what should the tester do next". The Home
 * screen renders entirely from getNextAction() so it always shows one clear
 * next step instead of a grid of unrelated tools.
 */

export type WorkflowTargetScreen = "language" | "training" | "client" | "recording" | "transcript" | "fields" | "qc" | "export";

export type WorkflowStepId = "setup" | "client" | "record" | "review" | "save";

export type WorkflowUrgency = "normal" | "attention" | "urgent";

export const WORKFLOW_STEPS: Array<{ id: WorkflowStepId; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "client", label: "Client" },
  { id: "record", label: "Record" },
  { id: "review", label: "Review" },
  { id: "save", label: "Save" }
];

export interface WorkflowState {
  testerSetupComplete: boolean;
  /** Preferred language chosen and its pack is either downloaded or reachable online. */
  languagePackReady: boolean;
  trainingComplete: boolean;
  hasActiveClient: boolean;
  recordingStage: "not_started" | "in_progress" | "finished";
  /** True once the transcript has been reviewed and fields extracted (Transcript Review → Captured Fields). */
  transcriptReviewed: boolean;
  recordsNeedingQc: number;
  recordsPendingSync: number;
  totalRecords: number;
}

export interface NextAction {
  label: string;
  subtitle: string;
  targetScreen: WorkflowTargetScreen;
  urgency: WorkflowUrgency;
  stepId: WorkflowStepId;
  disabledReason?: string;
}

/**
 * Returns the one next action the tester should take, given the current app
 * state. Order matters — each check assumes every earlier check has passed.
 */
export function getNextAction(state: WorkflowState): NextAction {
  if (!state.testerSetupComplete) {
    return {
      label: "Complete tester setup",
      subtitle: "Finish setup before starting a test.",
      targetScreen: "language",
      urgency: "attention",
      stepId: "setup"
    };
  }

  if (!state.languagePackReady) {
    return {
      label: "Choose a language pack",
      subtitle: "Select and download a language pack to begin.",
      targetScreen: "language",
      urgency: "attention",
      stepId: "setup"
    };
  }

  if (!state.trainingComplete) {
    return {
      label: "Complete training",
      subtitle: "Finish the short training before testing clients.",
      targetScreen: "training",
      urgency: "attention",
      stepId: "setup"
    };
  }

  if (!state.hasActiveClient) {
    // Between clients: surface a QC/export backlog before offering a new
    // client, but never let it block starting one — see requirement 10.
    if (state.recordsNeedingQc > 0) {
      return {
        label: "Open QC review",
        subtitle: `${state.recordsNeedingQc} record${state.recordsNeedingQc === 1 ? " needs" : "s need"} QC before export.`,
        targetScreen: "qc",
        urgency: "urgent",
        stepId: "save"
      };
    }

    if (state.totalRecords > 0) {
      return {
        label: "Export records",
        subtitle: "Records are ready. Export for reporting.",
        targetScreen: "export",
        urgency: "normal",
        stepId: "save"
      };
    }

    return {
      label: "Start new anonymous client",
      subtitle: "Create a non-personal client ID and begin the guided test.",
      targetScreen: "client",
      urgency: "normal",
      stepId: "client"
    };
  }

  if (state.recordingStage === "not_started") {
    return {
      label: "Start recording",
      subtitle: "Follow the prompts and record one continuous conversation.",
      targetScreen: "recording",
      urgency: "normal",
      stepId: "record"
    };
  }

  if (state.recordingStage === "in_progress") {
    return {
      label: "Continue recording",
      subtitle: "Recording is active. Continue the guided test.",
      targetScreen: "recording",
      urgency: "normal",
      stepId: "record"
    };
  }

  if (!state.transcriptReviewed) {
    return {
      label: "Review transcript",
      subtitle: "Check the draft transcript before saving the record.",
      targetScreen: "transcript",
      urgency: "normal",
      stepId: "review"
    };
  }

  // Recording finished and transcript reviewed, but the client hasn't been
  // saved yet (extraction has run, tester is on/returning to Captured Fields).
  return {
    label: "Review captured fields",
    subtitle: "Confirm the captured fields before saving.",
    targetScreen: "fields",
    urgency: "normal",
    stepId: "review"
  };
}
