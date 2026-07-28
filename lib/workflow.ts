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
    // Between clients, the tester must always be able to start the next one —
    // any QC/export backlog is surfaced as a badge on Home and stays one tap
    // away via More, but it must never occupy the single primary action, or
    // the field loop (test client after client) stalls after the first save.
    return {
      label: "Start new test",
      subtitle: "Generates a client ID — no name, DOB, phone, or address.",
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
