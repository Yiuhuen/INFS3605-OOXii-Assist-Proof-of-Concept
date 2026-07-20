"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { Dashboard } from "@/components/screens/Dashboard";
import { MoreScreen } from "@/components/screens/MoreScreen";
import { LanguageScreen } from "@/components/screens/LanguageScreen";
import { TrainingScreen } from "@/components/screens/TrainingScreen";
import { ClientScreen } from "@/components/screens/ClientScreen";
import { RecordingScreen } from "@/components/screens/RecordingScreen";
import { TranscriptScreen } from "@/components/screens/TranscriptScreen";
import { CapturedFieldsScreen } from "@/components/screens/CapturedFieldsScreen";
import { SavedScreen } from "@/components/screens/SavedScreen";
import { QcScreen } from "@/components/screens/QcScreen";
import { ExportScreen } from "@/components/screens/ExportScreen";
import { InsightsScreen } from "@/components/screens/InsightsScreen";
import { AdminScreen } from "@/components/screens/AdminScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { recordsToLonglistCsv, recordsToAuditCsv, downloadCsv } from "@/lib/csv";
import { getFallbackPack } from "@/lib/languagePacks";
import { generateClientId, generateMarkerId, generateRecordId, generateSegmentId } from "@/lib/ids";
import { mockExtractFields } from "@/lib/mockAi";
import { computeProcessingStatus, evaluateNeedsQc, recordNeedsQc } from "@/lib/qc";
import { getNextAction, type WorkflowState } from "@/lib/workflow";
import { getAudioBlob, saveAudioBlob } from "@/lib/offlineDb";
import { loadAuthMode, saveAuthMode, type AuthMode } from "@/lib/auth";
import { applyDisplaySettings, loadDisplaySettings, saveDisplaySettings, type DisplaySettings } from "@/lib/settings";
import { speakClientPrompt } from "@/lib/speech";
import {
  createBrowserRecognitionController,
  getSpeechRecognitionConstructor,
  isLiveTranscriptSupportedLanguage,
  mockTranslateToEnglish,
  type LiveTranscriptController,
  type TranscriptEngineStatus
} from "@/lib/liveTranscript";
import type { InsightTargetPage } from "@/lib/insights";
import {
  clearRecords,
  demoTester,
  loadLanguagePacks,
  loadRecords,
  loadTester,
  saveLanguagePacks,
  saveRecord,
  saveTester
} from "@/lib/storage";
import { isSupabaseConfigured, supabase, syncRecordToSupabase } from "@/lib/supabase";
import {
  createEmptyManualFields,
  REQUIRED_EXTRACTED_FIELDS,
  UNKNOWN_FIELD_VALUE,
  type ClientRecord,
  type ConnectionMode,
  type ExtractedFields,
  type ExtractionSource,
  type LanguageCode,
  type LanguagePack,
  type ManualExtractedFields,
  type ProcessingStatus,
  type PromptMarker,
  type PromptStep,
  type RecordingStatus,
  type Tester,
  type TestRecord,
  type TranscriptSegment,
  type UnclearSegment
} from "@/lib/types";

type Screen =
  | "login"
  | "dashboard"
  | "more"
  | "language"
  | "training"
  | "client"
  | "recording"
  | "transcript"
  | "fields"
  | "saved"
  | "qc"
  | "export"
  | "insights"
  | "admin"
  | "settings";

const blankClient = (): ClientRecord => ({
  id: generateClientId(),
  age_band: "45–54",
  gender: "female",
  cataract_history: "no",
  location_site: "Site A",
  currently_has_glasses: "no",
  tester_note: "",
  created_at: new Date().toISOString()
});

/**
 * Never leaves a required/populate field blank in storage — a field the local
 * extraction (or manual entry) could not determine is written as the literal
 * "UNKNOWN" rather than an empty string, and still counts as missing for QC
 * and confidence purposes. Never a guess: only fills in what was truly absent.
 */
function scoreExtractedFields(fields: ExtractedFields): ExtractedFields {
  const withUnknowns: ExtractedFields = { ...fields };
  (Object.keys(createEmptyManualFields()) as Array<keyof ManualExtractedFields>).forEach((field) => {
    if (!String(withUnknowns[field] ?? "").trim()) {
      withUnknowns[field] = UNKNOWN_FIELD_VALUE;
    }
  });
  const missing_fields = REQUIRED_EXTRACTED_FIELDS.filter((field) => {
    const value = String(withUnknowns[field] ?? "").trim();
    return !value || value === UNKNOWN_FIELD_VALUE;
  });
  const confidence_score = Math.max(0.45, Math.round((1 - missing_fields.length / REQUIRED_EXTRACTED_FIELDS.length) * 100) / 100);
  return { ...withUnknowns, missing_fields, confidence_score };
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [authMode, setAuthMode] = useState<AuthMode>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");

  const [tester, setTester] = useState<Tester>(demoTester);
  const [languagePacks, setLanguagePacks] = useState<LanguagePack[]>([]);
  const [client, setClient] = useState<ClientRecord>(blankClient());
  const [hasDraftClient, setHasDraftClient] = useState(false);
  const [records, setRecords] = useState<TestRecord[]>([]);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [manualFields, setManualFields] = useState<ManualExtractedFields>(createEmptyManualFields());

  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [micError, setMicError] = useState(false);
  const [micFailureAt, setMicFailureAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverrideInput, setShowOverrideInput] = useState(false);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [recordingStartedAt, setRecordingStartedAt] = useState("");
  const [recordingStoppedAt, setRecordingStoppedAt] = useState("");

  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[]>([]);
  const [interimText, setInterimText] = useState("");
  const [transcriptUnavailable, setTranscriptUnavailable] = useState(false);
  /** Why transcriptUnavailable is true — drives which honest fallback copy the recording screen shows. */
  const [transcriptUnavailableReason, setTranscriptUnavailableReason] = useState<"browser" | "language" | null>(null);
  const [transcriptEngineStatus, setTranscriptEngineStatus] = useState<TranscriptEngineStatus>("idle");
  const [lastTranscriptError, setLastTranscriptError] = useState("");
  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState(false);
  /** Feature-detected via navigator.permissions — "unsupported" on browsers (e.g. Safari) that don't expose the Permissions API for "microphone". Dev diagnostics only. */
  const [micPermissionStatus, setMicPermissionStatus] = useState<PermissionState | "unsupported">("unsupported");
  /** Standalone "Test speech recognition only" diagnostic — runs SpeechRecognition without MediaRecorder or touching the real transcript state. QA/dev use only. */
  const [sttTestStatus, setSttTestStatus] = useState<TranscriptEngineStatus>("idle");
  const [sttTestInterim, setSttTestInterim] = useState("");
  const [sttTestFinalText, setSttTestFinalText] = useState("");
  const [sttTestError, setSttTestError] = useState("");
  const [promptMarkers, setPromptMarkers] = useState<PromptMarker[]>([]);
  const [unclearSegments, setUnclearSegments] = useState<UnclearSegment[]>([]);
  const [rawTranscriptLanguage, setRawTranscriptLanguage] = useState<LanguageCode>("en");
  const [englishProcessingTranscript, setEnglishProcessingTranscript] = useState("");

  const [rawTranscript, setRawTranscript] = useState("");
  const [correctedTranscript, setCorrectedTranscript] = useState("");
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [editedFields, setEditedFields] = useState<ExtractedFields | null>(null);
  const [extractionSource, setExtractionSource] = useState<ExtractionSource>("raw_transcript");

  const [latestRecord, setLatestRecord] = useState<TestRecord | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("browser");
  const [browserOnline, setBrowserOnline] = useState(true);
  const [syncMessage, setSyncMessage] = useState("");
  const [qcAudioUrl, setQcAudioUrl] = useState("");
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(loadDisplaySettings());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTranscriptRef = useRef<LiveTranscriptController | null>(null);
  /** Separate controller for the dev-only "Test speech recognition only" button — deliberately isolated from liveTranscriptRef so it never touches MediaRecorder or the real transcript segments. */
  const sttTestControllerRef = useRef<LiveTranscriptController | null>(null);
  const currentStepIdRef = useRef<string>("");
  /** True once the tester (or the app) has told the live transcript engine to
   * stop for good — consulted by the recognition controller before every
   * auto-restart attempt so an intentional stop (pause, manual Stop, Finish &
   * review) can never race with a pending "restart after silence" timer. */
  const intentionalStopRef = useRef(false);

  useEffect(() => {
    setTester(loadTester());
    setLanguagePacks(loadLanguagePacks());
    setRecords(loadRecords());
    setBrowserOnline(navigator.onLine);
    setSpeechRecognitionSupported(getSpeechRecognitionConstructor() !== null);
    const settings = loadDisplaySettings();
    setDisplaySettings(settings);
    applyDisplaySettings(settings);

    let micPermissionStatusRef: PermissionStatus | null = null;
    const handleMicPermissionChange = () => {
      if (micPermissionStatusRef) setMicPermissionStatus(micPermissionStatusRef.state);
    };
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((status) => {
          micPermissionStatusRef = status;
          setMicPermissionStatus(status.state);
          status.addEventListener("change", handleMicPermissionChange);
        })
        .catch(() => setMicPermissionStatus("unsupported"));
    }

    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    // Re-reads storage directly (rather than closing over the `tester` state)
    // so the "last active" touch below is correct regardless of React's
    // batching of the setTester call a few lines up in this same effect.
    function touchTesterActivity() {
      const restored: Tester = { ...loadTester(), setup_completed: true, last_active_at: new Date().toISOString() };
      saveTester(restored);
      setTester(restored);
    }

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setAuthMode("supabase");
          saveAuthMode("supabase");
          touchTesterActivity();
        }
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setAuthMode("supabase");
          saveAuthMode("supabase");
          touchTesterActivity();
        }
      });
      return () => {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
        micPermissionStatusRef?.removeEventListener("change", handleMicPermissionChange);
        subscription.subscription.unsubscribe();
      };
    }

    const storedMode = loadAuthMode();
    if (storedMode === "demo") {
      setAuthMode("demo");
      touchTesterActivity();
    }

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      micPermissionStatusRef?.removeEventListener("change", handleMicPermissionChange);
    };
  }, []);

  useEffect(() => {
    if (!authMode) {
      setScreen("login");
      return;
    }
    if (screen === "login") {
      setScreen(tester.preferred_language ? (tester.is_new_tester ? "language" : "dashboard") : "language");
    }
  }, [authMode, screen, tester.is_new_tester, tester.preferred_language]);

  useEffect(() => {
    if (screen !== "recording") {
      setNudgeVisible(false);
      return;
    }
    if (recording || audioBlob || overrideReason.trim()) {
      setNudgeVisible(false);
      return;
    }
    const timeout = setTimeout(() => setNudgeVisible(true), 15000);
    return () => clearTimeout(timeout);
  }, [screen, recording, audioBlob, overrideReason]);

  const isOnline = connectionMode === "force-online" ? true : connectionMode === "force-offline" ? false : browserOnline;

  useEffect(() => {
    if (!authMode || !isOnline) return;
    void syncPendingRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMode, isOnline]);

  const activePack = useMemo(() => {
    const selected = languagePacks.find((pack) => pack.code === tester.preferred_language);
    if (!selected) return getFallbackPack(languagePacks);
    if (!selected.downloaded && !isOnline) return getFallbackPack(languagePacks);
    return selected;
  }, [isOnline, languagePacks, tester.preferred_language]);
  const currentStep = activePack.prompts_json[currentStepIndex] ?? activePack.prompts_json[0];

  useEffect(() => {
    currentStepIdRef.current = currentStep?.id ?? "";
  }, [currentStep]);

  const englishGloss = useMemo(() => {
    if (!currentStep || activePack.code === "en") return undefined;
    const englishPack = languagePacks.find((pack) => pack.code === "en");
    return englishPack?.prompts_json.find((step) => step.id === currentStep.id)?.client_prompt;
  }, [activePack.code, currentStep, languagePacks]);

  const recordingStatus: RecordingStatus = micError ? "failed" : audioBlob ? "recorded" : overrideReason.trim() ? "manual_override" : "not_recorded";
  // Gates only "Finish & review transcript" — prompt navigation (swipe/
  // Prev/Next/arrow keys) is always available regardless of recording state,
  // so the tester can browse the card sequence freely. An active recording
  // (still in progress) is enough to finish; the tester never has to tap
  // Stop first just to unlock the button (see finishRecordingAndReview).
  const canFinishRecording =
    recording ||
    paused ||
    recordingStatus === "recorded" ||
    recordingStatus === "manual_override" ||
    (recordingStatus === "failed" && overrideReason.trim().length > 0);

  // Pre-save processing-status previews (no TestRecord/sync_status exists yet at this point).
  const transcriptCapturedPreview = transcriptSegments.some((segment) => segment.isFinal && segment.text.trim());
  const manualFallbackUsedPreview = recordingStatus !== "recorded" ? Boolean(overrideReason.trim()) : !transcriptCapturedPreview && Boolean(overrideReason.trim());
  // The swipe card never reorders or skips the fixed clinical sequence — this
  // only tracks which of those steps were actually shown while a capture
  // session was active, so an incomplete pass through the cards still gets
  // flagged for QC instead of silently passing.
  const visitedStepIds = useMemo(() => new Set(promptMarkers.map((marker) => marker.stepId)), [promptMarkers]);
  const missingPromptSteps = useMemo(
    () => activePack.prompts_json.filter((step) => !visitedStepIds.has(step.id)),
    [activePack, visitedStepIds]
  );
  const hasUnvisitedPromptsPreview = missingPromptSteps.length > 0;
  const transcriptNeedsQc = evaluateNeedsQc({
    recordingStatus,
    editedByUser: false,
    confidenceScore: 1,
    missingFieldsCount: 0,
    transcriptCaptured: transcriptCapturedPreview,
    manualFallbackUsed: manualFallbackUsedPreview,
    hasUnclearSegments: unclearSegments.length > 0,
    hasUnvisitedPrompts: hasUnvisitedPromptsPreview
  });
  const transcriptProcessingStatus: ProcessingStatus = computeProcessingStatus({
    transcriptCaptured: transcriptCapturedPreview,
    needsQc: transcriptNeedsQc,
    qcApproved: false,
    synced: false
  });
  const fieldsEffective = editedFields ?? extracted;
  const fieldsNeedsQc = fieldsEffective
    ? evaluateNeedsQc({
        recordingStatus,
        editedByUser: editedFields !== null,
        confidenceScore: fieldsEffective.confidence_score,
        missingFieldsCount: fieldsEffective.missing_fields.length,
        transcriptCaptured: transcriptCapturedPreview,
        manualFallbackUsed: manualFallbackUsedPreview,
        hasUnclearSegments: unclearSegments.length > 0,
        hasUnvisitedPrompts: hasUnvisitedPromptsPreview
      })
    : false;
  const fieldsProcessingStatus: ProcessingStatus = computeProcessingStatus({
    transcriptCaptured: transcriptCapturedPreview,
    needsQc: fieldsNeedsQc,
    qcApproved: false,
    synced: false
  });

  const recordsNeedingQc = records.filter(recordNeedsQc).length;
  const recordsPendingSync = records.filter((record) => record.sync_status === "Pending sync").length;

  // "recorded but not yet finished/reviewed" (tapped Stop without Finish &
  // review) still counts as in-progress — it sends the tester back into the
  // recording screen rather than announcing a brand-new recording.
  const recordingStage: WorkflowState["recordingStage"] =
    recording || paused ? "in_progress" : rawTranscript.trim() ? "finished" : recordingStartedAt ? "in_progress" : "not_started";

  const nextAction = getNextAction({
    testerSetupComplete: tester.setup_completed,
    languagePackReady: Boolean(tester.preferred_language) && (activePack.downloaded || isOnline),
    trainingComplete: !tester.is_new_tester,
    hasActiveClient: hasDraftClient,
    recordingStage,
    transcriptReviewed: extracted !== null,
    recordsNeedingQc,
    recordsPendingSync,
    totalRecords: records.length
  });

  function updateTester(next: Tester) {
    setTester(next);
    saveTester(next);
  }

  function updateLanguagePacks(next: LanguagePack[]) {
    setLanguagePacks(next);
    saveLanguagePacks(next);
  }

  function resetTest() {
    setClient(blankClient());
    setHasDraftClient(false);
    setCurrentStepIndex(0);
    setManualFields(createEmptyManualFields());
    setRecording(false);
    setPaused(false);
    setElapsedSeconds(0);
    stopElapsedTimer();
    stopLiveTranscript();
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setMicError(false);
    setMicFailureAt("");
    setOverrideReason("");
    setShowOverrideInput(false);
    setRecordingStartedAt("");
    setRecordingStoppedAt("");
    setTranscriptSegments([]);
    setInterimText("");
    setTranscriptUnavailable(false);
    setTranscriptUnavailableReason(null);
    setTranscriptEngineStatus("idle");
    setLastTranscriptError("");
    intentionalStopRef.current = false;
    setPromptMarkers([]);
    setUnclearSegments([]);
    setRawTranscriptLanguage("en");
    setEnglishProcessingTranscript("");
    setRawTranscript("");
    setCorrectedTranscript("");
    setExtracted(null);
    setEditedFields(null);
    setExtractionSource("raw_transcript");
    setLatestRecord(null);
    setSyncMessage("");
  }

  function beginDemoLogin() {
    setAuthMode("demo");
    saveAuthMode("demo");
    setAuthError("");
    const next: Tester = { ...tester, id: tester.id || demoTester.id, setup_completed: true, last_active_at: new Date().toISOString() };
    updateTester(next);
    setScreen(next.preferred_language ? (next.is_new_tester ? "language" : "dashboard") : "language");
  }

  async function handleEmailLogin(email: string, password: string) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    updateTester({ ...tester, setup_completed: true, last_active_at: new Date().toISOString() });
    setScreen(tester.preferred_language ? (tester.is_new_tester ? "language" : "dashboard") : "language");
  }

  async function handleEmailSignUp(email: string, password: string) {
    if (!supabase) return;
    setAuthBusy(true);
    setAuthError("");
    const { error } = await supabase.auth.signUp({ email, password });
    setAuthBusy(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    setAuthError("Account created. Check your email if confirmation is required, then log in.");
  }

  async function handleLogout() {
    if (supabase && authMode === "supabase") await supabase.auth.signOut();
    saveAuthMode(null);
    setAuthMode(null);
    setScreen("login");
  }

  function selectLanguage(code: LanguageCode) {
    const nextPacks = languagePacks.map((pack) => (pack.code === code ? { ...pack, downloaded: true } : pack));
    updateLanguagePacks(nextPacks);
    updateTester({ ...tester, preferred_language: code });
  }

  function continueAfterLanguage() {
    setScreen(tester.is_new_tester ? "training" : "dashboard");
  }

  function completeTraining() {
    updateTester({ ...tester, is_new_tester: false });
    setScreen("dashboard");
  }

  function speakPrompt(text: string) {
    speakClientPrompt(text);
  }

  function startElapsedTimer() {
    stopElapsedTimer();
    elapsedTimerRef.current = setInterval(() => setElapsedSeconds((value) => value + 1), 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current);
      elapsedTimerRef.current = null;
    }
  }

  function addPromptMarker(step: PromptStep, stepIndexValue: number, navigationAction: PromptMarker["navigationAction"]) {
    setPromptMarkers((prev) => [
      ...prev,
      {
        id: generateMarkerId(),
        stepId: step.id,
        stepIndex: stepIndexValue,
        timestamp: Date.now(),
        promptText: step.client_prompt,
        language: activePack.code,
        navigationAction,
        createdAt: new Date().toISOString()
      }
    ]);
  }

  function startLiveTranscript() {
    stopLiveTranscript();
    intentionalStopRef.current = false;
    const language = activePack.code;
    setTranscriptUnavailable(false);
    setTranscriptUnavailableReason(null);
    setLastTranscriptError("");

    if (!isLiveTranscriptSupportedLanguage(language)) {
      // No real recognizer for this language in the PoC — never simulate
      // live voice-to-text. Audio still records; the tester can add a
      // manual transcript instead.
      setTranscriptUnavailable(true);
      setTranscriptUnavailableReason("language");
      setTranscriptEngineStatus("stopped");
      return;
    }

    const handlers = {
      onInterim: (text: string) => setInterimText(text),
      onFinal: (text: string, confidence?: number) => {
        if (!text.trim()) return;
        setInterimText("");
        setTranscriptSegments((prev) => [
          ...prev,
          {
            id: generateSegmentId(),
            timestamp: new Date().toISOString(),
            language,
            text: text.trim(),
            isFinal: true,
            confidence,
            stepId: currentStepIdRef.current
          }
        ]);
      },
      onStatusChange: (status: TranscriptEngineStatus) => setTranscriptEngineStatus(status),
      onError: (errorCode: string) => {
        setLastTranscriptError(errorCode);
        // "no-speech"/"aborted"/"network" are transient — the controller
        // keeps retrying on its own. Only permission/hardware errors mean
        // the engine genuinely can't run, so only those flip the UI over to
        // the honest "unavailable" fallback + manual transcript box.
        if (errorCode === "not-allowed" || errorCode === "service-not-allowed" || errorCode === "audio-capture") {
          setTranscriptUnavailable(true);
          setTranscriptUnavailableReason("browser");
        }
      }
    };

    const shouldContinue = () => !intentionalStopRef.current;
    const controller = createBrowserRecognitionController(handlers, shouldContinue);

    if (!controller) {
      setTranscriptUnavailable(true);
      setTranscriptUnavailableReason("browser");
      setTranscriptEngineStatus("error");
      return;
    }
    liveTranscriptRef.current = controller;
    controller.start();
  }

  /**
   * Dev/QA-only diagnostic: runs SpeechRecognition on its own, completely
   * independent of MediaRecorder and the real transcriptSegments state, so a
   * tester can confirm the browser engine works before/without starting a
   * full recording. Only reachable from the debug-gated diagnostics panel.
   */
  function startSttOnlyTest() {
    sttTestControllerRef.current?.stop();
    setSttTestInterim("");
    setSttTestFinalText("");
    setSttTestError("");
    const controller = createBrowserRecognitionController({
      onInterim: (text) => setSttTestInterim(text),
      onFinal: (text) => {
        if (!text.trim()) return;
        setSttTestInterim("");
        setSttTestFinalText((prev) => (prev ? `${prev} ${text.trim()}` : text.trim()));
      },
      onStatusChange: (status) => setSttTestStatus(status),
      onError: (errorCode) => setSttTestError(errorCode)
    });
    if (!controller) {
      setSttTestStatus("error");
      setSttTestError("unsupported");
      return;
    }
    sttTestControllerRef.current = controller;
    controller.start();
  }

  function stopSttOnlyTest() {
    sttTestControllerRef.current?.stop();
    sttTestControllerRef.current = null;
    setSttTestInterim("");
    setSttTestStatus("stopped");
  }

  function stopLiveTranscript() {
    liveTranscriptRef.current?.stop();
    liveTranscriptRef.current = null;
    setInterimText("");
    setTranscriptEngineStatus("idle");
  }

  function markSectionUnclear() {
    const lastSegment = transcriptSegments[transcriptSegments.length - 1];
    setUnclearSegments((prev) => [
      ...prev,
      {
        id: generateSegmentId(),
        timestamp: new Date().toISOString(),
        stepId: currentStepIdRef.current,
        note: lastSegment ? `Near: "${lastSegment.text}"` : "Flagged during recording"
      }
    ]);
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setPaused(false);
      setMicError(false);
      setRecordingStartedAt((prev) => prev || new Date().toISOString());
      startElapsedTimer();
      addPromptMarker(currentStep, currentStepIndex, "start");
      startLiveTranscript();
    } catch {
      const timestamp = new Date().toISOString();
      setMicFailureAt(timestamp);
      const placeholder = new Blob([`Recording unavailable at ${timestamp}. Microphone access failed or was denied.`], { type: "text/plain" });
      setAudioBlob(placeholder);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(placeholder));
      setMicError(true);
      setRecording(false);
      setShowOverrideInput(true);
      addPromptMarker(currentStep, currentStepIndex, "start");
    }
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause();
    setPaused(true);
    stopElapsedTimer();
    stopLiveTranscript();
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume();
    setPaused(false);
    startElapsedTimer();
    startLiveTranscript();
  }

  function stopRecording() {
    intentionalStopRef.current = true;
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setPaused(false);
    setRecordingStoppedAt(new Date().toISOString());
    stopElapsedTimer();
    stopLiveTranscript();
  }

  /**
   * `recordingHappened` is passed in explicitly rather than derived from
   * `recordingStatus`/`audioBlob` here, because audioBlob is only set
   * asynchronously inside MediaRecorder's `onstop` handler — at the moment
   * "Finish & review" stops the recorder and builds the transcript in the
   * same tick, audioBlob (and therefore recordingStatus) hasn't caught up
   * yet. recordingStartedAt is set synchronously in startRecording, so it's
   * a reliable signal for "a real recording session happened" independent
   * of that lag.
   */
  function buildRawTranscriptFromSegments(segments: TranscriptSegment[], recordingHappened: boolean): string {
    const finalSegments = segments.filter((segment) => segment.isFinal && segment.text.trim());
    if (finalSegments.length > 0) {
      return finalSegments
        .slice()
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map((segment) => segment.text)
        .join("\n");
    }
    if (recordingHappened) {
      const parts = [
        "Audio recorded, but no live transcript segments were captured. Please add a manual transcript or continue with QC review."
      ];
      if (manualFields.additional_notes.trim()) parts.push(`Manual notes: ${manualFields.additional_notes.trim()}`);
      return parts.join(" ");
    }
    const parts = [`Recording not available (${recordingStatus.replace("_", " ")}).`];
    if (overrideReason.trim()) parts.push(`Tester override reason: ${overrideReason.trim()}`);
    if (manualFields.additional_notes.trim()) parts.push(`Manual notes: ${manualFields.additional_notes.trim()}`);
    return parts.join(" ");
  }

  /**
   * Handles "Finish & review transcript": stops continuous recording (if
   * still running — the tester does not need to tap Stop separately first),
   * folds any in-flight interim text into a final segment so it isn't lost,
   * builds raw_transcript_text from the captured segments immediately, mock
   * translates it, and only then navigates — so Transcript Review always
   * opens already populated when segments exist.
   */
  function finishRecordingAndReview() {
    intentionalStopRef.current = true;
    const pendingInterim = interimText.trim();
    const stepIdForPending = currentStepIdRef.current;
    const recordingHappened = Boolean(recordingStartedAt) && !micError;

    if (recording || paused) {
      addPromptMarker(currentStep, currentStepIndex, "finish");
      mediaRecorderRef.current?.stop();
      setRecording(false);
      setPaused(false);
      setRecordingStoppedAt(new Date().toISOString());
      stopElapsedTimer();
    }
    stopLiveTranscript();

    let segmentsForTranscript = transcriptSegments;
    if (pendingInterim) {
      const pendingSegment: TranscriptSegment = {
        id: generateSegmentId(),
        timestamp: new Date().toISOString(),
        language: activePack.code,
        text: pendingInterim,
        isFinal: true,
        stepId: stepIdForPending
      };
      segmentsForTranscript = [...transcriptSegments, pendingSegment];
      setTranscriptSegments(segmentsForTranscript);
    }

    const transcript = buildRawTranscriptFromSegments(segmentsForTranscript, recordingHappened);
    const language = activePack.code;
    const english = mockTranslateToEnglish(transcript, language);
    setRawTranscript(transcript);
    setRawTranscriptLanguage(language);
    setEnglishProcessingTranscript(english);
    setCorrectedTranscript(english);
    setExtracted(null);
    setEditedFields(null);
    setScreen("transcript");
  }

  /**
   * "Generate transcript from captured draft" safety button on Transcript
   * Review — re-runs the same honest, no-fake-STT logic against the latest
   * segments/manual notes. Never invents a transcript from audio alone.
   */
  function regenerateTranscriptDraft() {
    const recordingHappened = Boolean(recordingStartedAt) && !micError;
    const transcript = buildRawTranscriptFromSegments(transcriptSegments, recordingHappened);
    const language = rawTranscriptLanguage || activePack.code;
    const english = mockTranslateToEnglish(transcript, language);
    setRawTranscript(transcript);
    setEnglishProcessingTranscript(english);
    setCorrectedTranscript(english);
  }

  /**
   * Swipe-card navigation — moves the visible prompt only. Recording,
   * transcript segments, and the timer are untouched; the only side effect
   * is a timestamped marker (when a capture session is active) and updating
   * currentStepIdRef synchronously so the very next transcript segment is
   * attributed to the step the tester is now looking at, not the one they
   * left. Bounds are re-checked here too (not just in the UI) so this stays
   * safe to call directly.
   */
  function goToPromptIndex(targetIndex: number, navigationAction: "next" | "previous") {
    if (targetIndex < 0 || targetIndex >= activePack.prompts_json.length) return;
    const targetStep = activePack.prompts_json[targetIndex];
    if (recording || paused) addPromptMarker(targetStep, targetIndex, navigationAction);
    currentStepIdRef.current = targetStep.id;
    setCurrentStepIndex(targetIndex);
  }

  function goToNextPrompt() {
    goToPromptIndex(currentStepIndex + 1, "next");
  }

  function goToPreviousPrompt() {
    goToPromptIndex(currentStepIndex - 1, "previous");
  }

  function runExtraction() {
    const transcriptChanged = correctedTranscript.trim().length > 0 && correctedTranscript.trim() !== englishProcessingTranscript.trim();
    const source: ExtractionSource = transcriptChanged ? "corrected_transcript" : recordingStatus === "recorded" ? "raw_transcript" : "manual_override";
    const base = transcriptChanged ? correctedTranscript : englishProcessingTranscript;
    const aiResult = mockExtractFields(base);
    const merged: ExtractedFields = scoreExtractedFields({
      ...aiResult,
      right_eye_distance_result: aiResult.right_eye_distance_result || manualFields.right_eye_distance_result,
      left_eye_distance_result: aiResult.left_eye_distance_result || manualFields.left_eye_distance_result,
      final_readable_line: aiResult.final_readable_line || manualFields.final_readable_line,
      glasses_selected: aiResult.glasses_selected || manualFields.glasses_selected,
      comfort_response: aiResult.comfort_response || manualFields.comfort_response,
      cataract_history_confirmed: aiResult.cataract_history_confirmed || manualFields.cataract_history_confirmed,
      current_glasses: aiResult.current_glasses || manualFields.current_glasses,
      additional_notes: aiResult.additional_notes || manualFields.additional_notes
    });
    setExtracted(merged);
    setEditedFields(null);
    setExtractionSource(source);
  }

  function goToCapturedFields() {
    runExtraction();
    setScreen("fields");
  }

  async function syncPendingRecords() {
    const pendingRecords = loadRecords().filter((record) => record.sync_status === "Pending sync");
    if (pendingRecords.length === 0) return;

    if (!isSupabaseConfigured) {
      setSyncMessage("Demo mode: pending records are saved locally. Add Supabase env vars to enable cloud sync.");
      return;
    }

    let syncedCount = 0;
    let failedCount = 0;
    let latestRecordUpdate: TestRecord | null = null;

    for (const pendingRecord of pendingRecords) {
      const updatedAt = new Date().toISOString();
      const transcriptCaptured = Boolean(pendingRecord.raw_transcript_text.trim()) || pendingRecord.transcript_segments.some((segment) => segment.isFinal && segment.text.trim());
      const syncedRecord: TestRecord = {
        ...pendingRecord,
        sync_status: "Synced",
        connection_status: "online",
        processing_status: computeProcessingStatus({
          transcriptCaptured,
          needsQc: pendingRecord.needs_qc,
          qcApproved: pendingRecord.qc_status === "Approved",
          synced: true
        }),
        sync_attempts: pendingRecord.sync_attempts + 1,
        updated_at: updatedAt
      };
      const syncResult = await syncRecordToSupabase(syncedRecord);
      const nextRecord: TestRecord = syncResult.ok
        ? syncedRecord
        : {
            ...pendingRecord,
            sync_status: "Failed",
            connection_status: "online",
            sync_attempts: pendingRecord.sync_attempts + 1,
            updated_at: updatedAt
          };

      if (syncResult.ok) syncedCount += 1;
      else failedCount += 1;

      saveRecord(nextRecord);
      if (latestRecord?.id === pendingRecord.id) latestRecordUpdate = nextRecord;
    }

    setRecords(loadRecords());
    if (latestRecordUpdate) setLatestRecord(latestRecordUpdate);
    if (failedCount > 0) {
      setSyncMessage(`Sync attempted: ${syncedCount} synced, ${failedCount} failed. Failed records remain available locally.`);
    } else {
      setSyncMessage(`Sync complete: ${syncedCount} pending record${syncedCount === 1 ? "" : "s"} synced to Supabase.`);
    }
  }

  function editExtractedField(key: keyof ExtractedFields, value: string) {
    setEditedFields((prev) => {
      const base = prev ?? extracted;
      if (!base) return prev;
      return scoreExtractedFields({ ...base, [key]: value });
    });
  }

  async function saveCurrentRecord() {
    if (!extracted) return;
    const now = new Date().toISOString();
    const id = generateRecordId();
    const effective = editedFields ?? extracted;
    const editedByUser = editedFields !== null;
    const transcriptCaptured = transcriptCapturedPreview;
    const needsQc = evaluateNeedsQc({
      recordingStatus,
      editedByUser,
      confidenceScore: effective.confidence_score,
      missingFieldsCount: effective.missing_fields.length,
      transcriptCaptured,
      manualFallbackUsed: manualFallbackUsedPreview,
      hasUnclearSegments: unclearSegments.length > 0,
      hasUnvisitedPrompts: hasUnvisitedPromptsPreview
    });

    let audioLocalUrl: string;
    if (recordingStatus === "recorded") {
      audioLocalUrl = `indexeddb://audio/${id}`;
      if (audioBlob) {
        try {
          await saveAudioBlob(id, audioBlob);
        } catch {
          // Private-mode browsers may block IndexedDB; the record still carries a placeholder URL.
        }
      }
    } else if (recordingStatus === "failed") {
      audioLocalUrl = `unresolved://segment/${id}?at=${encodeURIComponent(micFailureAt || now)}`;
    } else {
      audioLocalUrl = `override://no-recording/${id}?at=${encodeURIComponent(now)}`;
    }

    const initialSyncStatus = isOnline ? (isSupabaseConfigured ? "Pending sync" : "Synced") : "Pending sync";
    const record: TestRecord = {
      id,
      session_id: id,
      client_id: client.id,
      tester_id: tester.id,
      deployment_site: client.location_site,
      language: activePack.code,
      status: needsQc ? "Needs QC" : "Complete",
      sync_status: initialSyncStatus,
      connection_status: isOnline ? "online" : "offline",
      audio_local_url: audioLocalUrl,
      recording_status: recordingStatus,
      recording_started_at: recordingStartedAt,
      recording_stopped_at: recordingStoppedAt,
      recording_duration_seconds: elapsedSeconds,
      manual_override_reason: overrideReason,
      raw_transcript_text: rawTranscript,
      raw_transcript_language: rawTranscriptLanguage,
      english_processing_transcript: englishProcessingTranscript,
      transcript_segments: transcriptSegments,
      prompt_markers: promptMarkers,
      has_unvisited_prompts: hasUnvisitedPromptsPreview,
      unclear_segments: unclearSegments,
      corrected_transcript_text: correctedTranscript,
      extracted_json: extracted,
      edited_extracted_json: editedFields,
      extraction_source: extractionSource,
      edited_by_user: editedByUser,
      requires_qc_verification: editedByUser,
      confidence_score: effective.confidence_score,
      missing_fields: effective.missing_fields,
      qc_status: needsQc ? "Unreviewed" : "Approved",
      needs_qc: needsQc,
      qc_notes: "",
      processing_status: computeProcessingStatus({
        transcriptCaptured,
        needsQc,
        qcApproved: !needsQc,
        synced: initialSyncStatus === "Synced"
      }),
      sync_attempts: 0,
      client_snapshot: client,
      created_at: now,
      updated_at: now
    };

    let savedRecord = record;
    saveRecord(savedRecord);

    if (isOnline && isSupabaseConfigured) {
      const syncedRecord: TestRecord = {
        ...record,
        sync_status: "Synced",
        connection_status: "online",
        processing_status: computeProcessingStatus({ transcriptCaptured, needsQc, qcApproved: !needsQc, synced: true }),
        sync_attempts: record.sync_attempts + 1,
        updated_at: new Date().toISOString()
      };
      const syncResult = await syncRecordToSupabase(syncedRecord);
      savedRecord = syncResult.ok
        ? syncedRecord
        : {
            ...record,
            sync_status: "Failed",
            connection_status: "online",
            sync_attempts: record.sync_attempts + 1,
            updated_at: new Date().toISOString()
          };
      saveRecord(savedRecord);
      setSyncMessage(
        syncResult.ok ? "Synced to Supabase." : `Saved locally; Supabase sync failed (${syncResult.reason}).`
      );
    } else if (isOnline) {
      setSyncMessage("Saved in local demo mode. Add Supabase env vars for cloud sync.");
    } else {
      setSyncMessage("Saved locally. This record will remain pending until connection returns.");
    }

    setRecords(loadRecords());
    setLatestRecord(savedRecord);
    setHasDraftClient(false);
    updateTester({ ...tester, last_active_at: now });

    setScreen("saved");
  }

  function updateQcRecord(record: TestRecord, patch: Partial<ExtractedFields>) {
    const base = record.edited_extracted_json ?? record.extracted_json;
    const nextExtracted = scoreExtractedFields({ ...base, ...patch });
    const transcriptCaptured = Boolean(record.raw_transcript_text.trim()) || record.transcript_segments.some((segment) => segment.isFinal && segment.text.trim());
    const nextRecord: TestRecord = {
      ...record,
      edited_extracted_json: nextExtracted,
      edited_by_user: true,
      requires_qc_verification: true,
      confidence_score: nextExtracted.confidence_score,
      missing_fields: nextExtracted.missing_fields,
      qc_status: "Corrected",
      needs_qc: true,
      processing_status: computeProcessingStatus({ transcriptCaptured, needsQc: true, qcApproved: false, synced: record.sync_status === "Synced" }),
      updated_at: new Date().toISOString()
    };
    saveRecord(nextRecord);
    setRecords(loadRecords());
    setLatestRecord(nextRecord);
  }

  function updateQcNotes(record: TestRecord, notes: string) {
    const nextRecord: TestRecord = { ...record, qc_notes: notes, updated_at: new Date().toISOString() };
    saveRecord(nextRecord);
    setRecords(loadRecords());
    setLatestRecord(nextRecord);
  }

  function markQcComplete(record: TestRecord) {
    const transcriptCaptured = Boolean(record.raw_transcript_text.trim()) || record.transcript_segments.some((segment) => segment.isFinal && segment.text.trim());
    const nextRecord: TestRecord = {
      ...record,
      qc_status: "Approved",
      needs_qc: false,
      requires_qc_verification: false,
      processing_status: computeProcessingStatus({ transcriptCaptured, needsQc: false, qcApproved: true, synced: record.sync_status === "Synced" }),
      updated_at: new Date().toISOString()
    };
    saveRecord(nextRecord);
    setRecords(loadRecords());
    setLatestRecord(nextRecord);
  }

  async function loadQcAudio(record: TestRecord) {
    setQcAudioUrl("");
    if (record.recording_status !== "recorded") return;
    try {
      const blob = await getAudioBlob(record.id);
      if (blob) setQcAudioUrl(URL.createObjectURL(blob));
    } catch {
      setQcAudioUrl("");
    }
  }

  function handleExportLonglist() {
    const csv = recordsToLonglistCsv(records);
    downloadCsv(`ooxii-assist-longlist-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function handleExportAudit() {
    const csv = recordsToAuditCsv(records);
    downloadCsv(`ooxii-assist-audit-longlist-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  function handleDisplaySettingsChange(next: DisplaySettings) {
    setDisplaySettings(next);
    saveDisplaySettings(next);
    applyDisplaySettings(next);
  }

  function requireTrainingThen(action: () => void) {
    if (tester.is_new_tester) {
      setScreen("training");
      return;
    }
    action();
  }

  /**
   * Drives Home's single primary CTA. The target screen always comes from
   * getNextAction (lib/workflow.ts), which already accounts for training/
   * language readiness — no extra guard is needed here, just the resetTest()
   * side effect that starting a fresh client requires.
   */
  function goToNextAction() {
    if (nextAction.targetScreen === "client") {
      resetTest();
    }
    setScreen(nextAction.targetScreen);
  }

  function navigateToInsightTarget(target: InsightTargetPage) {
    if (target === "QC") setScreen("qc");
    else if (target === "Export") setScreen("export");
    else if (target === "Prompt Editor") setScreen("admin");
    else {
      requireTrainingThen(() => {
        if (hasDraftClient) setScreen("recording");
        else {
          resetTest();
          setScreen("client");
        }
      });
    }
  }

  const isAuthenticated = Boolean(authMode);

  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-6 sm:max-w-lg">
      {screen === "login" && (
        <LoginScreen
          onDemoLogin={beginDemoLogin}
          supabaseConfigured={isSupabaseConfigured}
          onEmailLogin={handleEmailLogin}
          onEmailSignUp={handleEmailSignUp}
          authError={authError}
          authBusy={authBusy}
        />
      )}

      {isAuthenticated && screen === "dashboard" && (
        <Dashboard
          tester={tester}
          activePack={activePack}
          isOnline={isOnline}
          displaySettings={displaySettings}
          nextAction={nextAction}
          recordsNeedingQc={recordsNeedingQc}
          recordsPendingSync={recordsPendingSync}
          onNextAction={goToNextAction}
          onMore={() => setScreen("more")}
          onLogout={handleLogout}
        />
      )}

      {isAuthenticated && screen === "more" && (
        <MoreScreen
          isOnline={isOnline}
          recordsNeedingQc={recordsNeedingQc}
          onLanguage={() => setScreen("language")}
          onDisplaySettings={() => setScreen("settings")}
          onReplayTraining={() => setScreen("training")}
          onQc={() => setScreen("qc")}
          onInsights={() => setScreen("insights")}
          onExport={() => setScreen("export")}
          onAdmin={() => setScreen("admin")}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "language" && (
        <LanguageScreen
          packs={languagePacks}
          selectedCode={tester.preferred_language}
          isOnline={isOnline}
          onSelect={selectLanguage}
          onContinue={continueAfterLanguage}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "training" && (
        <TrainingScreen
          tester={tester}
          activePack={activePack}
          isOnline={isOnline}
          onComplete={completeTraining}
          onBack={() => setScreen(tester.is_new_tester ? "language" : "dashboard")}
        />
      )}

      {isAuthenticated && screen === "client" && (
        <ClientScreen
          client={client}
          setClient={setClient}
          isOnline={isOnline}
          onBack={() => setScreen("dashboard")}
          onContinue={() => {
            setHasDraftClient(true);
            setCurrentStepIndex(0);
            setScreen("recording");
          }}
        />
      )}

      {isAuthenticated && screen === "recording" && currentStep && (
        <RecordingScreen
          clientId={client.id}
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activePack.prompts_json.length}
          upcomingSteps={activePack.prompts_json.slice(currentStepIndex + 1)}
          languageName={activePack.name}
          englishGloss={englishGloss}
          manualFields={manualFields}
          setManualFields={setManualFields}
          recording={recording}
          paused={paused}
          elapsedSeconds={elapsedSeconds}
          micError={micError}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          showOverrideInput={showOverrideInput}
          setShowOverrideInput={setShowOverrideInput}
          recordingStatus={recordingStatus}
          isOnline={isOnline}
          nudgeVisible={nudgeVisible}
          canFinish={canFinishRecording}
          transcriptSegments={transcriptSegments}
          interimText={interimText}
          transcriptUnavailable={transcriptUnavailable}
          transcriptUnavailableReason={transcriptUnavailableReason}
          transcriptEngineStatus={transcriptEngineStatus}
          lastTranscriptError={lastTranscriptError}
          speechRecognitionSupported={speechRecognitionSupported}
          micPermissionStatus={micPermissionStatus}
          sttTestStatus={sttTestStatus}
          sttTestInterim={sttTestInterim}
          sttTestFinalText={sttTestFinalText}
          sttTestError={sttTestError}
          onStartSttOnlyTest={startSttOnlyTest}
          onStopSttOnlyTest={stopSttOnlyTest}
          unclearSegments={unclearSegments}
          onMarkUnclear={markSectionUnclear}
          speakPrompt={speakPrompt}
          startRecording={startRecording}
          pauseRecording={pauseRecording}
          resumeRecording={resumeRecording}
          stopRecording={stopRecording}
          onBack={currentStepIndex === 0 ? () => setScreen("client") : undefined}
          onNextPrompt={goToNextPrompt}
          onPreviousPrompt={goToPreviousPrompt}
          onFinish={finishRecordingAndReview}
        />
      )}

      {isAuthenticated && screen === "transcript" && (
        <TranscriptScreen
          clientId={client.id}
          rawTranscript={rawTranscript}
          rawTranscriptLanguageName={languagePacks.find((pack) => pack.code === rawTranscriptLanguage)?.name ?? rawTranscriptLanguage}
          englishProcessingTranscript={englishProcessingTranscript}
          correctedTranscript={correctedTranscript}
          setCorrectedTranscript={setCorrectedTranscript}
          processingStatus={transcriptProcessingStatus}
          needsQc={transcriptNeedsQc}
          manualOverrideReason={overrideReason}
          audioUrl={audioUrl}
          recordingDurationSeconds={elapsedSeconds}
          unclearSegments={unclearSegments}
          promptMarkers={promptMarkers}
          missingPromptLabels={missingPromptSteps.map((step) => step.client_prompt)}
          isOnline={isOnline}
          canGenerateDraft={!transcriptCapturedPreview && Boolean(recordingStartedAt) && !micError}
          onGenerateDraft={regenerateTranscriptDraft}
          onNext={goToCapturedFields}
          onBack={() => setScreen("recording")}
        />
      )}

      {isAuthenticated && screen === "fields" && extracted && (
        <CapturedFieldsScreen
          clientId={client.id}
          extracted={extracted}
          editedFields={editedFields}
          processingStatus={fieldsProcessingStatus}
          isOnline={isOnline}
          onEditField={editExtractedField}
          onBackToTranscript={() => setScreen("transcript")}
          onSave={saveCurrentRecord}
        />
      )}

      {isAuthenticated && screen === "saved" && latestRecord && (
        <SavedScreen
          record={latestRecord}
          syncMessage={syncMessage}
          onNextClient={() => {
            resetTest();
            setScreen("client");
          }}
          onQc={() => setScreen("qc")}
          onDashboard={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "qc" && (
        <QcScreen
          records={records}
          latestRecordId={latestRecord?.id ?? null}
          qcAudioUrl={qcAudioUrl}
          isOnline={isOnline}
          loadQcAudio={loadQcAudio}
          updateRecord={updateQcRecord}
          updateNotes={updateQcNotes}
          markComplete={markQcComplete}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "export" && (
        <ExportScreen
          records={records}
          isOnline={isOnline}
          onExportLonglist={handleExportLonglist}
          onExportAudit={handleExportAudit}
          onClear={() => {
            clearRecords();
            setRecords([]);
          }}
          onReviewQc={() => setScreen("qc")}
          onInsights={() => setScreen("insights")}
          onInsightNavigate={navigateToInsightTarget}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "insights" && (
        <InsightsScreen records={records} isOnline={isOnline} onNavigate={navigateToInsightTarget} onBack={() => setScreen("dashboard")} />
      )}

      {isAuthenticated && screen === "admin" && (
        <AdminScreen packs={languagePacks} setPacks={updateLanguagePacks} isOnline={isOnline} onBack={() => setScreen("dashboard")} />
      )}

      {isAuthenticated && screen === "settings" && (
        <SettingsScreen
          settings={displaySettings}
          onChange={handleDisplaySettingsChange}
          tester={tester}
          onTesterChange={updateTester}
          languagePacks={languagePacks}
          connectionMode={connectionMode}
          onConnectionModeChange={setConnectionMode}
          isOnline={isOnline}
          onLanguage={() => setScreen("language")}
          onLogout={handleLogout}
          onBack={() => setScreen("dashboard")}
        />
      )}
    </main>
  );
}
