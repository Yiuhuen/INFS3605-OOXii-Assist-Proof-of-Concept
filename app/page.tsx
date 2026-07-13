"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { LoginScreen } from "@/components/screens/LoginScreen";
import { Dashboard } from "@/components/screens/Dashboard";
import { LanguageScreen } from "@/components/screens/LanguageScreen";
import { TrainingScreen } from "@/components/screens/TrainingScreen";
import { ClientScreen } from "@/components/screens/ClientScreen";
import { TestingScreen } from "@/components/screens/TestingScreen";
import { RecordingScreen } from "@/components/screens/RecordingScreen";
import { TranscriptScreen } from "@/components/screens/TranscriptScreen";
import { CapturedFieldsScreen } from "@/components/screens/CapturedFieldsScreen";
import { SavedScreen } from "@/components/screens/SavedScreen";
import { QcScreen } from "@/components/screens/QcScreen";
import { ExportScreen } from "@/components/screens/ExportScreen";
import { AdminScreen } from "@/components/screens/AdminScreen";
import { SettingsScreen } from "@/components/screens/SettingsScreen";
import { recordsToCsv, downloadCsv } from "@/lib/csv";
import { getFallbackPack } from "@/lib/languagePacks";
import { generateClientId, generateRecordId } from "@/lib/ids";
import { demoTranscript, mockExtractFields } from "@/lib/mockAi";
import { getAudioBlob, saveAudioBlob } from "@/lib/offlineDb";
import { loadAuthMode, saveAuthMode, type AuthMode } from "@/lib/auth";
import { applyDisplaySettings, loadDisplaySettings, saveDisplaySettings, type DisplaySettings } from "@/lib/settings";
import { speakClientPrompt } from "@/lib/speech";
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
  type ClientRecord,
  type ConnectionMode,
  type ExtractedFields,
  type ExtractionSource,
  type LanguageCode,
  type LanguagePack,
  type ManualExtractedFields,
  type RecordingStatus,
  type Tester,
  type TestRecord
} from "@/lib/types";

type Screen =
  | "login"
  | "dashboard"
  | "language"
  | "training"
  | "client"
  | "testing"
  | "recording"
  | "transcript"
  | "fields"
  | "saved"
  | "qc"
  | "export"
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

function scoreExtractedFields(fields: ExtractedFields): ExtractedFields {
  const missing_fields = REQUIRED_EXTRACTED_FIELDS.filter((field) => !String(fields[field] ?? "").trim());
  const confidence_score = Math.max(0.45, Math.round((1 - missing_fields.length / REQUIRED_EXTRACTED_FIELDS.length) * 100) / 100);
  return { ...fields, missing_fields, confidence_score };
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

  useEffect(() => {
    setTester(loadTester());
    setLanguagePacks(loadLanguagePacks());
    setRecords(loadRecords());
    setBrowserOnline(navigator.onLine);
    const settings = loadDisplaySettings();
    setDisplaySettings(settings);
    applyDisplaySettings(settings);

    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    if (supabase) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setAuthMode("supabase");
          saveAuthMode("supabase");
        }
      });
      const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setAuthMode("supabase");
          saveAuthMode("supabase");
        }
      });
      return () => {
        window.removeEventListener("online", goOnline);
        window.removeEventListener("offline", goOffline);
        subscription.subscription.unsubscribe();
      };
    }

    const storedMode = loadAuthMode();
    if (storedMode === "demo") setAuthMode("demo");

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
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

  const englishGloss = useMemo(() => {
    if (!currentStep || activePack.code === "en") return undefined;
    const englishPack = languagePacks.find((pack) => pack.code === "en");
    return englishPack?.prompts_json.find((step) => step.id === currentStep.id)?.client_prompt;
  }, [activePack.code, currentStep, languagePacks]);

  const recordingStatus: RecordingStatus = micError ? "failed" : audioBlob ? "recorded" : overrideReason.trim() ? "manual_override" : "not_recorded";
  const canProceedRecording = recordingStatus === "recorded" || recordingStatus === "manual_override" || (recordingStatus === "failed" && overrideReason.trim().length > 0);

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
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setMicError(false);
    setMicFailureAt("");
    setOverrideReason("");
    setShowOverrideInput(false);
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
    const next = { ...tester, id: tester.id || demoTester.id };
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
      startElapsedTimer();
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
    }
  }

  function pauseRecording() {
    mediaRecorderRef.current?.pause();
    setPaused(true);
    stopElapsedTimer();
  }

  function resumeRecording() {
    mediaRecorderRef.current?.resume();
    setPaused(false);
    startElapsedTimer();
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
    setPaused(false);
    stopElapsedTimer();
  }

  function buildRawTranscript(): string {
    if (recordingStatus === "recorded") return demoTranscript;
    const parts = [`Recording not available (${recordingStatus.replace("_", " ")}).`];
    if (overrideReason.trim()) parts.push(`Tester override reason: ${overrideReason.trim()}`);
    if (manualFields.additional_notes.trim()) parts.push(`Manual notes: ${manualFields.additional_notes.trim()}`);
    return parts.join(" ");
  }

  function goToNextStep() {
    if (!canProceedRecording) return;
    if (currentStepIndex === activePack.prompts_json.length - 1) {
      const transcript = buildRawTranscript();
      setRawTranscript(transcript);
      setCorrectedTranscript(transcript);
      setExtracted(null);
      setEditedFields(null);
      setScreen("transcript");
    } else {
      setCurrentStepIndex((value) => value + 1);
      setScreen("testing");
    }
  }

  function runExtraction() {
    const transcriptChanged = correctedTranscript.trim().length > 0 && correctedTranscript.trim() !== rawTranscript.trim();
    const source: ExtractionSource = transcriptChanged ? "corrected_transcript" : recordingStatus === "recorded" ? "raw_transcript" : "manual_override";
    const base = transcriptChanged ? correctedTranscript : rawTranscript;
    const aiResult = mockExtractFields(base);
    const merged: ExtractedFields = scoreExtractedFields({
      ...aiResult,
      right_eye_distance_result: aiResult.right_eye_distance_result || manualFields.right_eye_distance_result,
      left_eye_distance_result: aiResult.left_eye_distance_result || manualFields.left_eye_distance_result,
      final_readable_line: aiResult.final_readable_line || manualFields.final_readable_line,
      glasses_selected: aiResult.glasses_selected || manualFields.glasses_selected,
      comfort_response: aiResult.comfort_response || manualFields.comfort_response,
      cataract_history_confirmed: aiResult.cataract_history_confirmed || manualFields.cataract_history_confirmed,
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
      const syncedRecord: TestRecord = {
        ...pendingRecord,
        sync_status: "Synced",
        connection_status: "online",
        updated_at: updatedAt
      };
      const syncResult = await syncRecordToSupabase(syncedRecord);
      const nextRecord: TestRecord = syncResult.ok
        ? syncedRecord
        : {
            ...pendingRecord,
            sync_status: "Failed",
            connection_status: "online",
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
    const needsQc = recordingStatus !== "recorded" || editedByUser || effective.confidence_score < 0.7 || effective.missing_fields.length > 0;

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
      client_id: client.id,
      tester_id: tester.id,
      language: activePack.code,
      status: needsQc ? "Needs QC" : "Complete",
      sync_status: initialSyncStatus,
      connection_status: isOnline ? "online" : "offline",
      audio_local_url: audioLocalUrl,
      recording_status: recordingStatus,
      manual_override_reason: overrideReason,
      raw_transcript_text: rawTranscript,
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
        updated_at: new Date().toISOString()
      };
      const syncResult = await syncRecordToSupabase(syncedRecord);
      savedRecord = syncResult.ok
        ? syncedRecord
        : {
            ...record,
            sync_status: "Failed",
            connection_status: "online",
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

    setScreen("saved");
  }

  function updateQcRecord(record: TestRecord, patch: Partial<ExtractedFields>) {
    const base = record.edited_extracted_json ?? record.extracted_json;
    const nextExtracted = scoreExtractedFields({ ...base, ...patch });
    const nextRecord: TestRecord = {
      ...record,
      edited_extracted_json: nextExtracted,
      edited_by_user: true,
      requires_qc_verification: true,
      confidence_score: nextExtracted.confidence_score,
      missing_fields: nextExtracted.missing_fields,
      qc_status: "Corrected",
      needs_qc: true,
      updated_at: new Date().toISOString()
    };
    saveRecord(nextRecord);
    setRecords(loadRecords());
    setLatestRecord(nextRecord);
  }

  function markQcComplete(record: TestRecord) {
    const nextRecord: TestRecord = {
      ...record,
      qc_status: "Approved",
      needs_qc: false,
      requires_qc_verification: false,
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

  function handleExport() {
    const csv = recordsToCsv(records);
    downloadCsv(`ooxii-assist-longlist-${new Date().toISOString().slice(0, 10)}.csv`, csv);
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
          records={records}
          activePack={activePack}
          isOnline={isOnline}
          displaySettings={displaySettings}
          hasDraftClient={hasDraftClient}
          onStartRecording={() =>
            requireTrainingThen(() => {
              if (hasDraftClient) setScreen("testing");
              else {
                resetTest();
                setScreen("client");
              }
            })
          }
          onNewClient={() =>
            requireTrainingThen(() => {
              resetTest();
              setScreen("client");
            })
          }
          onQc={() => setScreen("qc")}
          onExport={() => setScreen("export")}
          onLanguage={() => setScreen("language")}
          onSettings={() => setScreen("settings")}
          onAdmin={() => setScreen("admin")}
          onTraining={() => setScreen("training")}
          onLogout={handleLogout}
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
            setScreen("testing");
          }}
        />
      )}

      {isAuthenticated && screen === "testing" && currentStep && (
        <TestingScreen
          key={currentStep.id}
          clientId={client.id}
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activePack.prompts_json.length}
          languageName={activePack.name}
          manualFields={manualFields}
          setManualFields={setManualFields}
          isOnline={isOnline}
          speakPrompt={speakPrompt}
          onBack={() => {
            if (currentStepIndex === 0) setScreen("client");
            else {
              setCurrentStepIndex((value) => value - 1);
              setScreen("recording");
            }
          }}
          onContinue={() => setScreen("recording")}
        />
      )}

      {isAuthenticated && screen === "recording" && currentStep && (
        <RecordingScreen
          clientId={client.id}
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activePack.prompts_json.length}
          languageName={activePack.name}
          englishGloss={englishGloss}
          recording={recording}
          paused={paused}
          elapsedSeconds={elapsedSeconds}
          audioUrl={audioUrl}
          micError={micError}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          showOverrideInput={showOverrideInput}
          setShowOverrideInput={setShowOverrideInput}
          recordingStatus={recordingStatus}
          isOnline={isOnline}
          nudgeVisible={nudgeVisible}
          canProceed={canProceedRecording}
          speakPrompt={speakPrompt}
          startRecording={startRecording}
          pauseRecording={pauseRecording}
          resumeRecording={resumeRecording}
          stopRecording={stopRecording}
          onBack={() => setScreen("testing")}
          onNext={goToNextStep}
        />
      )}

      {isAuthenticated && screen === "transcript" && (
        <TranscriptScreen
          clientId={client.id}
          rawTranscript={rawTranscript}
          correctedTranscript={correctedTranscript}
          setCorrectedTranscript={setCorrectedTranscript}
          isOnline={isOnline}
          onNext={goToCapturedFields}
          onBack={() => setScreen("recording")}
        />
      )}

      {isAuthenticated && screen === "fields" && extracted && (
        <CapturedFieldsScreen
          clientId={client.id}
          extracted={extracted}
          editedFields={editedFields}
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
          markComplete={markQcComplete}
          onBack={() => setScreen("dashboard")}
        />
      )}

      {isAuthenticated && screen === "export" && (
        <ExportScreen
          records={records}
          isOnline={isOnline}
          onExport={handleExport}
          onClear={() => {
            clearRecords();
            setRecords([]);
          }}
          onReviewQc={() => setScreen("qc")}
          onBack={() => setScreen("dashboard")}
        />
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
          connectionMode={connectionMode}
          onConnectionModeChange={setConnectionMode}
          isOnline={isOnline}
          onLogout={handleLogout}
          onBack={() => setScreen("dashboard")}
        />
      )}
    </main>
  );
}
