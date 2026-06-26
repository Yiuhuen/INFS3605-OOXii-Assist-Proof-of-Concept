"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Download,
  FileDown,
  Languages,
  Mic,
  Play,
  RotateCcw,
  Settings,
  ShieldCheck,
  UploadCloud,
  Wifi,
  WifiOff
} from "lucide-react";
import { recordsToCsv, downloadCsv } from "@/lib/csv";
import { getFallbackPack } from "@/lib/languagePacks";
import { generateClientId, generateRecordId } from "@/lib/ids";
import { demoTranscript, mockExtractFields } from "@/lib/mockAi";
import { getAudioBlob, saveAudioBlob } from "@/lib/offlineDb";
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
import { syncRecordToSupabase } from "@/lib/supabase";
import type { ClientRecord, ExtractedFields, LanguageCode, LanguagePack, PromptStep, Tester, TestRecord } from "@/lib/types";

type Screen =
  | "login"
  | "dashboard"
  | "language"
  | "training"
  | "client"
  | "testing"
  | "recording"
  | "extraction"
  | "saved"
  | "qc"
  | "export"
  | "admin";

type ConnectionMode = "browser" | "force-online" | "force-offline";

type ManualResults = {
  right_eye_distance_result: string;
  left_eye_distance_result: string;
  final_readable_line: string;
  glasses_selected: string;
};

const blankClient = (): ClientRecord => ({
  id: generateClientId(),
  age_band: "45–54",
  gender: "female",
  cataract_history: "no",
  location_site: "Site A",
  currently_has_glasses: "no",
  created_at: new Date().toISOString()
});

const blankManualResults = (): ManualResults => ({
  right_eye_distance_result: "Line 6",
  left_eye_distance_result: "Line 7",
  final_readable_line: "Right Line 6; Left Line 7",
  glasses_selected: "Recorded verbally; needs QC confirmation"
});

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [tester, setTester] = useState<Tester>(demoTester);
  const [languagePacks, setLanguagePacks] = useState<LanguagePack[]>([]);
  const [client, setClient] = useState<ClientRecord>(blankClient());
  const [records, setRecords] = useState<TestRecord[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [manualResults, setManualResults] = useState<ManualResults>(blankManualResults());
  const [transcript, setTranscript] = useState("");
  const [extracted, setExtracted] = useState<ExtractedFields | null>(null);
  const [latestRecord, setLatestRecord] = useState<TestRecord | null>(null);
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>("browser");
  const [browserOnline, setBrowserOnline] = useState(true);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [qcAudioUrl, setQcAudioUrl] = useState("");
  const [syncMessage, setSyncMessage] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    setTester(loadTester());
    setLanguagePacks(loadLanguagePacks());
    setRecords(loadRecords());
    setBrowserOnline(navigator.onLine);
    const goOnline = () => setBrowserOnline(true);
    const goOffline = () => setBrowserOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const isOnline = connectionMode === "force-online" ? true : connectionMode === "force-offline" ? false : browserOnline;
  const activePack = useMemo(() => {
    const selected = languagePacks.find((pack) => pack.code === tester.preferred_language);
    if (!selected) return getFallbackPack(languagePacks);
    if (!selected.downloaded && !isOnline) return getFallbackPack(languagePacks);
    return selected;
  }, [isOnline, languagePacks, tester.preferred_language]);
  const currentStep = activePack.prompts_json[currentStepIndex] ?? activePack.prompts_json[0];

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
    setCurrentStepIndex(0);
    setManualResults(blankManualResults());
    setTranscript("");
    setExtracted(null);
    setLatestRecord(null);
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
    setSyncMessage("");
  }

  function beginDemoLogin() {
    const next = { ...tester, id: tester.id || demoTester.id };
    updateTester(next);
    setScreen(next.preferred_language ? (next.is_new_tester ? "language" : "dashboard") : "language");
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
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
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
    } catch {
      const fallbackBlob = new Blob(["Demo browser did not permit microphone access. Audio placeholder saved."], { type: "text/plain" });
      setAudioBlob(fallbackBlob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(URL.createObjectURL(fallbackBlob));
      setRecording(false);
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  function createMockTranscript() {
    setTranscript(demoTranscript);
  }

  function runExtraction() {
    const base = transcript || demoTranscript;
    const result = mockExtractFields(base);
    const withManualInputs: ExtractedFields = {
      ...result,
      right_eye_distance_result: result.right_eye_distance_result || manualResults.right_eye_distance_result,
      left_eye_distance_result: result.left_eye_distance_result || manualResults.left_eye_distance_result,
      final_readable_line: result.final_readable_line || manualResults.final_readable_line,
      glasses_selected: result.glasses_selected || manualResults.glasses_selected
    };
    const required: Array<keyof ExtractedFields> = [
      "comfort_response",
      "cataract_history_confirmed",
      "right_eye_distance_result",
      "left_eye_distance_result",
      "glasses_selected"
    ];
    withManualInputs.missing_fields = required.filter((field) => !String(withManualInputs[field] ?? "").trim());
    withManualInputs.confidence_score = Math.max(0.45, Math.round((1 - withManualInputs.missing_fields.length / required.length) * 100) / 100);
    setTranscript(base);
    setExtracted(withManualInputs);
    setScreen("extraction");
  }

  async function saveCurrentRecord() {
    if (!extracted) return;
    const now = new Date().toISOString();
    const id = generateRecordId();
    if (audioBlob) {
      try {
        await saveAudioBlob(id, audioBlob);
      } catch {
        // A browser may block IndexedDB in private mode. The record still carries an audio placeholder.
      }
    }

    const status = extracted.confidence_score < 0.7 || extracted.missing_fields.length > 0 ? "Needs QC" : "Complete";
    const record: TestRecord = {
      id,
      client_id: client.id,
      tester_id: tester.id,
      language: activePack.code,
      status,
      sync_status: isOnline ? "Synced" : "Pending sync",
      connection_status: isOnline ? "online" : "offline",
      audio_local_url: audioBlob ? `indexeddb://audio/${id}` : "audio-placeholder://not-recorded",
      transcript_text: transcript || demoTranscript,
      extracted_json: extracted,
      confidence_score: extracted.confidence_score,
      missing_fields: extracted.missing_fields,
      qc_status: status === "Needs QC" ? "Unreviewed" : "Approved",
      client_snapshot: client,
      created_at: now,
      updated_at: now
    };

    saveRecord(record);
    const nextRecords = loadRecords();
    setRecords(nextRecords);
    setLatestRecord(record);

    if (isOnline) {
      const syncResult = await syncRecordToSupabase(record);
      setSyncMessage(syncResult.ok ? "Synced to Supabase." : "Synced in local demo mode. Add Supabase env vars for cloud sync.");
    } else {
      setSyncMessage("Saved locally. This record will remain pending until connection returns.");
    }

    setScreen("saved");
  }

  function updateQcRecord(record: TestRecord, patch: Partial<ExtractedFields>) {
    const nextExtracted = { ...record.extracted_json, ...patch };
    nextExtracted.missing_fields = nextExtracted.missing_fields.filter((field) => String(nextExtracted[field as keyof ExtractedFields] ?? "").trim() === "");
    const nextRecord: TestRecord = {
      ...record,
      extracted_json: nextExtracted,
      confidence_score: nextExtracted.confidence_score,
      missing_fields: nextExtracted.missing_fields,
      qc_status: "Corrected",
      updated_at: new Date().toISOString()
    };
    saveRecord(nextRecord);
    setRecords(loadRecords());
    setLatestRecord(nextRecord);
  }

  async function loadQcAudio(record: TestRecord) {
    setQcAudioUrl("");
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

  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-4 py-5 sm:px-6 lg:px-8">
      <Header
        screen={screen}
        isOnline={isOnline}
        connectionMode={connectionMode}
        setConnectionMode={setConnectionMode}
        goHome={() => setScreen("dashboard")}
      />

      {screen === "login" && (
        <LoginScreen tester={tester} setTester={updateTester} onDemoLogin={beginDemoLogin} />
      )}

      {screen === "dashboard" && (
        <Dashboard
          tester={tester}
          records={records}
          activePack={activePack}
          isOnline={isOnline}
          onStart={() => {
            resetTest();
            setScreen("client");
          }}
          onLanguage={() => setScreen("language")}
          onTraining={() => setScreen("training")}
          onQc={() => setScreen("qc")}
          onExport={() => setScreen("export")}
          onAdmin={() => setScreen("admin")}
        />
      )}

      {screen === "language" && (
        <LanguageScreen
          packs={languagePacks}
          selectedCode={tester.preferred_language}
          isOnline={isOnline}
          onSelect={selectLanguage}
          onContinue={continueAfterLanguage}
        />
      )}

      {screen === "training" && (
        <TrainingScreen tester={tester} activePack={activePack} onComplete={completeTraining} onSkip={() => setScreen("dashboard")} />
      )}

      {screen === "client" && (
        <ClientScreen client={client} setClient={setClient} onBack={() => setScreen("dashboard")} onContinue={() => setScreen("testing")} />
      )}

      {screen === "testing" && currentStep && (
        <TestingScreen
          step={currentStep}
          stepIndex={currentStepIndex}
          totalSteps={activePack.prompts_json.length}
          languageName={activePack.name}
          manualResults={manualResults}
          setManualResults={setManualResults}
          speakPrompt={speakPrompt}
          onBack={() => (currentStepIndex === 0 ? setScreen("client") : setCurrentStepIndex((value) => value - 1))}
          onNext={() => {
            if (currentStepIndex === activePack.prompts_json.length - 1) setScreen("recording");
            else setCurrentStepIndex((value) => value + 1);
          }}
        />
      )}

      {screen === "recording" && (
        <RecordingScreen
          recording={recording}
          transcript={transcript}
          setTranscript={setTranscript}
          audioUrl={audioUrl}
          startRecording={startRecording}
          stopRecording={stopRecording}
          createMockTranscript={createMockTranscript}
          runExtraction={runExtraction}
          onBack={() => setScreen("testing")}
        />
      )}

      {screen === "extraction" && extracted && (
        <ExtractionScreen extracted={extracted} transcript={transcript} onBack={() => setScreen("recording")} onSave={saveCurrentRecord} />
      )}

      {screen === "saved" && latestRecord && (
        <SavedScreen record={latestRecord} syncMessage={syncMessage} onDashboard={() => setScreen("dashboard")} onQc={() => setScreen("qc")} />
      )}

      {screen === "qc" && (
        <QcScreen records={records} latestRecord={latestRecord} qcAudioUrl={qcAudioUrl} loadQcAudio={loadQcAudio} updateRecord={updateQcRecord} onBack={() => setScreen("dashboard")} />
      )}

      {screen === "export" && (
        <ExportScreen records={records} onExport={handleExport} onClear={() => { clearRecords(); setRecords([]); }} onBack={() => setScreen("dashboard")} />
      )}

      {screen === "admin" && (
        <AdminScreen packs={languagePacks} setPacks={updateLanguagePacks} onBack={() => setScreen("dashboard")} />
      )}
    </main>
  );
}

function Header({
  screen,
  isOnline,
  connectionMode,
  setConnectionMode,
  goHome
}: {
  screen: Screen;
  isOnline: boolean;
  connectionMode: ConnectionMode;
  setConnectionMode: (mode: ConnectionMode) => void;
  goHome: () => void;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-field-line bg-field-surface/80 p-4 shadow-field sm:flex-row sm:items-center sm:justify-between">
      <div>
        <button className="text-left" onClick={goHome}>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-field-accent">OOXii Assist</p>
          <h1 className="text-2xl font-black text-white">Week 7 Proof of Concept</h1>
        </button>
        <p className="mt-1 text-sm text-purple-100">Offline-first multilingual guidance, audio capture, QC and longlist export.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`status-pill ${isOnline ? "text-field-good" : "text-field-warn"}`}>
          {isOnline ? <Wifi className="mr-1 h-4 w-4" /> : <WifiOff className="mr-1 h-4 w-4" />}
          {isOnline ? "Online" : "Offline"}
        </span>
        <select className="field-input max-w-44 py-2 text-sm" value={connectionMode} onChange={(event) => setConnectionMode(event.target.value as ConnectionMode)} aria-label="Demo connection mode">
          <option value="browser">Browser status</option>
          <option value="force-online">Force online</option>
          <option value="force-offline">Force offline</option>
        </select>
        <span className="status-pill">Screen: {screen}</span>
      </div>
    </header>
  );
}

function LoginScreen({ tester, setTester, onDemoLogin }: { tester: Tester; setTester: (tester: Tester) => void; onDemoLogin: () => void }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <div className="field-card">
        <p className="status-pill mb-4">Demo tester account</p>
        <h2 className="text-4xl font-black leading-tight">A practical field tool, not another form to fight.</h2>
        <p className="mt-4 max-w-2xl text-lg text-purple-100">
          Use the demo account to walk through language selection, training, guided prompts, audio recording, mock AI extraction, offline save, QC review and CSV export.
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button className="primary-button" onClick={onDemoLogin}>Use demo tester</button>
          <button className="secondary-button" onClick={() => setTester({ ...tester, is_new_tester: !tester.is_new_tester })}>
            {tester.is_new_tester ? "Set as returning tester" : "Set as new tester"}
          </button>
        </div>
      </div>
      <div className="field-card space-y-4">
        <h3 className="text-xl font-black">Tester profile</h3>
        <label className="block">
          <span className="field-label">Tester ID</span>
          <input className="field-input" value={tester.id} onChange={(event) => setTester({ ...tester, id: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Role</span>
          <input className="field-input" value={tester.role} onChange={(event) => setTester({ ...tester, role: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Home base</span>
          <input className="field-input" value={tester.home_base} onChange={(event) => setTester({ ...tester, home_base: event.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Instruction mode</span>
          <select className="field-input" value={tester.instruction_mode} onChange={(event) => setTester({ ...tester, instruction_mode: event.target.value as Tester["instruction_mode"] })}>
            <option value="beginner">Beginner</option>
            <option value="concise">Concise returning tester</option>
          </select>
        </label>
      </div>
    </section>
  );
}

function Dashboard({
  tester,
  records,
  activePack,
  isOnline,
  onStart,
  onLanguage,
  onTraining,
  onQc,
  onExport,
  onAdmin
}: {
  tester: Tester;
  records: TestRecord[];
  activePack: LanguagePack;
  isOnline: boolean;
  onStart: () => void;
  onLanguage: () => void;
  onTraining: () => void;
  onQc: () => void;
  onExport: () => void;
  onAdmin: () => void;
}) {
  const pending = records.filter((record) => record.sync_status === "Pending sync").length;
  const qc = records.filter((record) => record.qc_status !== "Approved").length;
  return (
    <section className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
      <div className="field-card">
        <p className="status-pill mb-4">{tester.instruction_mode} mode</p>
        <h2 className="text-3xl font-black">Welcome, {tester.role}</h2>
        <p className="mt-2 text-purple-100">Home base: {tester.home_base}. Current language pack: {activePack.name}.</p>
        <button className="primary-button mt-8 w-full text-lg" onClick={onStart}>Start new anonymous client test</button>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <button className="secondary-button" onClick={onLanguage}><Languages className="mr-2 inline h-5 w-5" />Language packs</button>
          <button className="secondary-button" onClick={onTraining}><Play className="mr-2 inline h-5 w-5" />Training</button>
          <button className="secondary-button" onClick={onQc}><ClipboardCheck className="mr-2 inline h-5 w-5" />QC review</button>
          <button className="secondary-button" onClick={onExport}><FileDown className="mr-2 inline h-5 w-5" />Export longlist</button>
          <button className="secondary-button sm:col-span-2" onClick={onAdmin}><Settings className="mr-2 inline h-5 w-5" />Admin language editor</button>
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Metric title="Records on device" value={records.length} detail="Local offline-first store" icon={<Database />} />
        <Metric title="Pending sync" value={pending} detail={isOnline ? "Ready to upload" : "Waiting for connection"} icon={<UploadCloud />} />
        <Metric title="Needs QC" value={qc} detail="Missing or low-confidence data" icon={<ShieldCheck />} />
        <Metric title="Language" value={activePack.name} detail={activePack.downloaded ? "Available offline" : "Online fallback active"} icon={<Languages />} />
        <div className="field-card sm:col-span-2">
          <h3 className="text-xl font-black">Demo path for Week 7</h3>
          <p className="mt-2 text-purple-100">Show: new tester → language pack → training → anonymous client → guided prompt → recording → mock extraction → offline save → QC → CSV export.</p>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value, detail, icon }: { title: string; value: string | number; detail: string; icon: ReactNode }) {
  return (
    <div className="field-card">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-200 text-field-ink">{icon}</div>
      <p className="text-sm font-bold uppercase tracking-wide text-field-muted">{title}</p>
      <p className="mt-2 text-3xl font-black text-white">{value}</p>
      <p className="mt-1 text-sm text-purple-100">{detail}</p>
    </div>
  );
}

function LanguageScreen({ packs, selectedCode, isOnline, onSelect, onContinue }: { packs: LanguagePack[]; selectedCode: LanguageCode; isOnline: boolean; onSelect: (code: LanguageCode) => void; onContinue: () => void }) {
  return (
    <section className="field-card">
      <h2 className="text-3xl font-black">Select deployment language pack</h2>
      <p className="mt-2 text-purple-100">For the PoC, these are demo packs. The architecture is JSON-based so partner organisations can add or edit languages later.</p>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {packs.map((pack) => (
          <button key={pack.code} className={`rounded-3xl border p-5 text-left transition ${selectedCode === pack.code ? "border-field-accent bg-sky-200 text-field-ink" : "border-field-line bg-field-surface text-white hover:bg-field-card"}`} onClick={() => onSelect(pack.code)}>
            <p className="text-lg font-black">{pack.name}</p>
            <p className="mt-2 text-sm opacity-80">{pack.downloaded ? "Downloaded for offline use" : isOnline ? "Tap to download demo pack" : "Needs internet, English fallback available"}</p>
            <p className="mt-4 text-3xl">{pack.code === "en" ? "🇬🇧" : pack.code === "tpi" ? "🇵🇬" : "🇻🇺"}</p>
          </button>
        ))}
      </div>
      <button className="primary-button mt-6" onClick={onContinue}>Continue</button>
    </section>
  );
}

function TrainingScreen({ tester, activePack, onComplete, onSkip }: { tester: Tester; activePack: LanguagePack; onComplete: () => void; onSkip: () => void }) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <div className="field-card">
        <p className="status-pill mb-4">{tester.is_new_tester ? "Required for new tester" : "Optional refresher"}</p>
        <h2 className="text-3xl font-black">Standardised training video</h2>
        <div className="mt-5 flex aspect-video items-center justify-center rounded-3xl border border-field-line bg-field-ink text-center">
          <div>
            <Play className="mx-auto mb-3 h-16 w-16 text-field-accent" />
            <p className="text-xl font-black">Training video placeholder</p>
            <p className="mt-2 max-w-md text-purple-100">Partner NGO voice-over can be recorded in {activePack.name}. English subtitles can remain available for trainers.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button className="primary-button" onClick={onComplete}>Mark training complete</button>
          {!tester.is_new_tester && <button className="secondary-button" onClick={onSkip}>Return to dashboard</button>}
        </div>
      </div>
      <div className="field-card">
        <h3 className="text-xl font-black">What this proves</h3>
        <ul className="mt-3 space-y-3 text-purple-100">
          <li>• New testers cannot skip onboarding in the PoC flow.</li>
          <li>• Returning testers can access training as a helper, not a blocker.</li>
          <li>• Training communicates why accurate data entry matters.</li>
        </ul>
      </div>
    </section>
  );
}

function ClientScreen({ client, setClient, onBack, onContinue }: { client: ClientRecord; setClient: (client: ClientRecord) => void; onBack: () => void; onContinue: () => void }) {
  return (
    <section className="field-card">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="status-pill mb-3">No personal client data</p>
          <h2 className="text-3xl font-black">New anonymous client</h2>
          <p className="mt-2 text-purple-100">Client ID is short for paper handover. Names, DOB, phone and precise address are intentionally excluded.</p>
        </div>
        <button className="secondary-button" onClick={() => setClient({ ...client, id: generateClientId() })}><RotateCcw className="mr-2 inline h-5 w-5" />Regenerate ID</button>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <label>
          <span className="field-label">Anonymous client ID</span>
          <input className="field-input" value={client.id} onChange={(event) => setClient({ ...client, id: event.target.value })} />
        </label>
        <label>
          <span className="field-label">Age band</span>
          <select className="field-input" value={client.age_band} onChange={(event) => setClient({ ...client, age_band: event.target.value })}>
            {["Under 18", "18–34", "35–44", "45–54", "55–64", "65+"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Gender</span>
          <select className="field-input" value={client.gender} onChange={(event) => setClient({ ...client, gender: event.target.value })}>
            {["female", "male", "another / not specified"].map((value) => <option key={value}>{value}</option>)}
          </select>
        </label>
        <label>
          <span className="field-label">Cataract surgery history</span>
          <select className="field-input" value={client.cataract_history} onChange={(event) => setClient({ ...client, cataract_history: event.target.value as ClientRecord["cataract_history"] })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
        <label>
          <span className="field-label">General deployment site</span>
          <input className="field-input" value={client.location_site} onChange={(event) => setClient({ ...client, location_site: event.target.value })} />
        </label>
        <label>
          <span className="field-label">Currently has glasses?</span>
          <select className="field-input" value={client.currently_has_glasses} onChange={(event) => setClient({ ...client, currently_has_glasses: event.target.value as ClientRecord["currently_has_glasses"] })}>
            <option value="no">No</option>
            <option value="yes">Yes</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>
      <div className="mt-6 flex gap-3">
        <button className="secondary-button" onClick={onBack}><ArrowLeft className="mr-2 inline h-5 w-5" />Back</button>
        <button className="primary-button" onClick={onContinue}>Begin guided test</button>
      </div>
    </section>
  );
}

function TestingScreen({
  step,
  stepIndex,
  totalSteps,
  languageName,
  manualResults,
  setManualResults,
  speakPrompt,
  onBack,
  onNext
}: {
  step: PromptStep;
  stepIndex: number;
  totalSteps: number;
  languageName: string;
  manualResults: ManualResults;
  setManualResults: (results: ManualResults) => void;
  speakPrompt: (text: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_0.8fr]">
      <div className="field-card">
        <p className="status-pill mb-4">Step {stepIndex + 1} of {totalSteps} · {languageName}</p>
        <div className="rounded-3xl border border-field-line bg-field-surface p-5">
          <div className="text-6xl">{step.icon}</div>
          <h2 className="mt-4 text-3xl font-black">Tester instruction</h2>
          <p className="mt-2 text-lg text-purple-100">{step.tester_instruction}</p>
          <div className="mt-5 rounded-3xl bg-field-ink p-5">
            <p className="text-sm font-bold uppercase tracking-wide text-field-accent">Client-facing prompt</p>
            <p className="mt-2 text-2xl font-black leading-snug">{step.client_prompt}</p>
            <button className="primary-button mt-4" onClick={() => speakPrompt(step.client_prompt)}><Play className="mr-2 inline h-5 w-5" />Play prompt audio</button>
          </div>
          <div className="mt-5 rounded-3xl border border-field-line bg-field-card p-4">
            <p className="text-sm font-bold text-field-warn">Why this matters</p>
            <p className="mt-1 text-purple-100">{step.why_this_matters}</p>
          </div>
        </div>
        <div className="mt-5 flex gap-3">
          <button className="secondary-button" onClick={onBack}>Back</button>
          <button className="primary-button" onClick={onNext}>{stepIndex === totalSteps - 1 ? "Continue to recording" : "Next required step"}</button>
        </div>
      </div>
      <div className="field-card">
        <h3 className="text-xl font-black">Structured result inputs</h3>
        <p className="mt-2 text-sm text-purple-100">Manual fields remain available so the PoC does not rely on AI for clinical logic.</p>
        <div className="mt-5 space-y-4">
          <label>
            <span className="field-label">Right eye distance result</span>
            <input className="field-input" value={manualResults.right_eye_distance_result} onChange={(event) => setManualResults({ ...manualResults, right_eye_distance_result: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Left eye distance result</span>
            <input className="field-input" value={manualResults.left_eye_distance_result} onChange={(event) => setManualResults({ ...manualResults, left_eye_distance_result: event.target.value })} />
          </label>
          <label>
            <span className="field-label">Final readable line summary</span>
            <input className="field-input" value={manualResults.final_readable_line} onChange={(event) => setManualResults({ ...manualResults, final_readable_line: event.target.value })} />
          </label>
        </div>
      </div>
    </section>
  );
}

function RecordingScreen({ recording, transcript, setTranscript, audioUrl, startRecording, stopRecording, createMockTranscript, runExtraction, onBack }: { recording: boolean; transcript: string; setTranscript: (text: string) => void; audioUrl: string; startRecording: () => void; stopRecording: () => void; createMockTranscript: () => void; runExtraction: () => void; onBack: () => void }) {
  return (
    <section className="field-card">
      <p className="status-pill mb-4">Speech-to-text recorder</p>
      <h2 className="text-3xl font-black">Record client conversation</h2>
      <p className="mt-2 text-purple-100">The PoC saves audio locally and uses mock transcription so the Week 7 demo works without external API keys.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!recording ? <button className="primary-button" onClick={startRecording}><Mic className="mr-2 inline h-5 w-5" />Start recording</button> : <button className="danger-button" onClick={stopRecording}>Stop recording</button>}
        <button className="secondary-button" onClick={createMockTranscript}>Generate mock transcript</button>
        <button className="primary-button" onClick={runExtraction}>Run AI extraction</button>
      </div>
      {audioUrl && <audio className="mt-5 w-full" controls src={audioUrl} />}
      <label className="mt-6 block">
        <span className="field-label">Transcript text</span>
        <textarea className="field-input min-h-64" value={transcript} onChange={(event) => setTranscript(event.target.value)} placeholder="Use the mock transcript button, or paste/edit a transcript here." />
      </label>
      <div className="mt-5 flex gap-3">
        <button className="secondary-button" onClick={onBack}>Back to guided test</button>
      </div>
    </section>
  );
}

function ExtractionScreen({ extracted, transcript, onBack, onSave }: { extracted: ExtractedFields; transcript: string; onBack: () => void; onSave: () => void }) {
  const lowConfidence = extracted.confidence_score < 0.7 || extracted.missing_fields.length > 0;
  return (
    <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="field-card">
        <p className={`status-pill mb-4 ${lowConfidence ? "text-field-warn" : "text-field-good"}`}>Confidence {Math.round(extracted.confidence_score * 100)}%</p>
        <h2 className="text-3xl font-black">AI extraction results</h2>
        {lowConfidence ? (
          <div className="mt-4 rounded-3xl border border-yellow-300/50 bg-yellow-200/10 p-4 text-yellow-100">
            Low confidence or missing fields. The app would prompt: “Sorry, I did not get that clearly. Can you repeat the answer?”
          </div>
        ) : (
          <div className="mt-4 rounded-3xl border border-green-300/50 bg-green-200/10 p-4 text-green-100">All required fields found for the demo record.</div>
        )}
        <div className="mt-5 space-y-3">
          {Object.entries(extracted).filter(([key]) => key !== "missing_fields" && key !== "confidence_score").map(([key, value]) => (
            <div key={key} className="rounded-2xl border border-field-line bg-field-surface p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-field-muted">{key}</p>
              <p className="mt-1 text-white">{String(value) || "Missing"}</p>
            </div>
          ))}
        </div>
        {extracted.missing_fields.length > 0 && <p className="mt-4 text-field-warn">Missing: {extracted.missing_fields.join(", ")}</p>}
        <div className="mt-5 flex gap-3">
          <button className="secondary-button" onClick={onBack}>Back</button>
          <button className="primary-button" onClick={onSave}>Save record</button>
        </div>
      </div>
      <div className="field-card">
        <h3 className="text-xl font-black">Source transcript</h3>
        <pre className="mt-4 whitespace-pre-wrap rounded-3xl bg-field-ink p-4 text-sm leading-relaxed text-purple-100">{transcript}</pre>
      </div>
    </section>
  );
}

function SavedScreen({ record, syncMessage, onDashboard, onQc }: { record: TestRecord; syncMessage: string; onDashboard: () => void; onQc: () => void }) {
  return (
    <section className="field-card text-center">
      <CheckCircle2 className="mx-auto h-16 w-16 text-field-good" />
      <h2 className="mt-4 text-3xl font-black">Record saved</h2>
      <p className="mt-2 text-purple-100">Client {record.client_id} is marked {record.sync_status}. {syncMessage}</p>
      <div className="mx-auto mt-6 grid max-w-2xl gap-3 sm:grid-cols-3">
        <span className="status-pill justify-center">Status: {record.status}</span>
        <span className="status-pill justify-center">QC: {record.qc_status}</span>
        <span className="status-pill justify-center">Confidence: {Math.round(record.confidence_score * 100)}%</span>
      </div>
      <div className="mt-7 flex justify-center gap-3">
        <button className="secondary-button" onClick={onDashboard}>Dashboard</button>
        <button className="primary-button" onClick={onQc}>Open QC review</button>
      </div>
    </section>
  );
}

function QcScreen({ records, latestRecord, qcAudioUrl, loadQcAudio, updateRecord, onBack }: { records: TestRecord[]; latestRecord: TestRecord | null; qcAudioUrl: string; loadQcAudio: (record: TestRecord) => void; updateRecord: (record: TestRecord, patch: Partial<ExtractedFields>) => void; onBack: () => void }) {
  const [selectedId, setSelectedId] = useState(latestRecord?.id ?? records[0]?.id ?? "");
  const selected = records.find((record) => record.id === selectedId) ?? records[0];

  useEffect(() => {
    if (selected) loadQcAudio(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  if (!selected) {
    return <section className="field-card"><h2 className="text-3xl font-black">QC review</h2><p className="mt-2 text-purple-100">No records yet. Complete a test first.</p><button className="secondary-button mt-5" onClick={onBack}>Back</button></section>;
  }

  return (
    <section className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
      <div className="field-card">
        <h2 className="text-3xl font-black">QC review</h2>
        <label className="mt-5 block">
          <span className="field-label">Select record</span>
          <select className="field-input" value={selected.id} onChange={(event) => setSelectedId(event.target.value)}>
            {records.map((record) => <option key={record.id} value={record.id}>{record.client_id} · {record.qc_status} · {record.sync_status}</option>)}
          </select>
        </label>
        <div className="mt-5 rounded-3xl border border-field-line bg-field-surface p-4">
          <p className="text-sm font-bold uppercase tracking-wide text-field-muted">Client ID</p>
          <p className="text-3xl font-black">{selected.client_id}</p>
          <p className="mt-2 text-purple-100">Confidence {Math.round(selected.confidence_score * 100)}% · {selected.status}</p>
        </div>
        {qcAudioUrl ? <audio className="mt-5 w-full" controls src={qcAudioUrl} /> : <div className="mt-5 rounded-3xl border border-dashed border-field-line p-4 text-purple-100">Audio playback placeholder: no audio blob found for this browser session.</div>}
        <h3 className="mt-6 text-xl font-black">Transcript</h3>
        <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-3xl bg-field-ink p-4 text-sm text-purple-100">{selected.transcript_text}</pre>
        <button className="secondary-button mt-5" onClick={onBack}>Back</button>
      </div>
      <div className="field-card">
        <h3 className="text-xl font-black">Editable extracted fields</h3>
        <p className="mt-2 text-purple-100">Missing fields are highlighted so QC can listen back and fill blanks.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {Object.entries(selected.extracted_json).filter(([key]) => key !== "missing_fields" && key !== "confidence_score").map(([key, value]) => {
            const missing = selected.missing_fields.includes(key);
            return (
              <label key={key} className={missing ? "rounded-3xl border border-yellow-300/60 bg-yellow-200/10 p-3" : "block"}>
                <span className="field-label">{key}</span>
                <textarea className="field-input min-h-24" value={String(value)} onChange={(event) => updateRecord(selected, { [key]: event.target.value } as Partial<ExtractedFields>)} />
              </label>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ExportScreen({ records, onExport, onClear, onBack }: { records: TestRecord[]; onExport: () => void; onClear: () => void; onBack: () => void }) {
  return (
    <section className="field-card">
      <h2 className="text-3xl font-black">Export QC longlist</h2>
      <p className="mt-2 text-purple-100">Exports a separate CSV list for review and reporting. It is not a replacement for the main clinical database.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <button className="primary-button" onClick={onExport} disabled={records.length === 0}><Download className="mr-2 inline h-5 w-5" />Export CSV</button>
        <button className="danger-button" onClick={onClear} disabled={records.length === 0}>Clear local demo records</button>
        <button className="secondary-button" onClick={onBack}>Back</button>
      </div>
      <div className="mt-6 overflow-x-auto rounded-3xl border border-field-line">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-field-ink text-field-accent">
            <tr>
              <th className="p-3">Client</th>
              <th className="p-3">Tester</th>
              <th className="p-3">Language</th>
              <th className="p-3">Sync</th>
              <th className="p-3">QC</th>
              <th className="p-3">Confidence</th>
              <th className="p-3">Missing</th>
              <th className="p-3">Created</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record.id} className="border-t border-field-line">
                <td className="p-3 font-bold">{record.client_id}</td>
                <td className="p-3">{record.tester_id}</td>
                <td className="p-3">{record.language}</td>
                <td className="p-3">{record.sync_status}</td>
                <td className="p-3">{record.qc_status}</td>
                <td className="p-3">{Math.round(record.confidence_score * 100)}%</td>
                <td className="p-3">{record.missing_fields.join(", ") || "None"}</td>
                <td className="p-3">{new Date(record.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdminScreen({ packs, setPacks, onBack }: { packs: LanguagePack[]; setPacks: (packs: LanguagePack[]) => void; onBack: () => void }) {
  const [selectedCode, setSelectedCode] = useState<LanguageCode>(packs[0]?.code ?? "en");
  const pack = packs.find((item) => item.code === selectedCode) ?? packs[0];

  function updateStep(stepId: string, patch: Partial<PromptStep>) {
    setPacks(packs.map((item) => item.code !== pack.code ? item : { ...item, prompts_json: item.prompts_json.map((step) => step.id === stepId ? { ...step, ...patch } : step) }));
  }

  return (
    <section className="field-card">
      <h2 className="text-3xl font-black">Admin language editor</h2>
      <p className="mt-2 text-purple-100">This proves the localisation architecture: prompt text can be edited without changing the clinical flow or rebuilding the app.</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <select className="field-input max-w-xs" value={selectedCode} onChange={(event) => setSelectedCode(event.target.value as LanguageCode)}>
          {packs.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
        </select>
        <button className="secondary-button" onClick={onBack}>Back</button>
      </div>
      {pack && <div className="mt-6 space-y-5">
        {pack.prompts_json.map((step) => (
          <div className="rounded-3xl border border-field-line bg-field-surface p-4" key={step.id}>
            <p className="status-pill mb-3">{step.id}</p>
            <label className="block">
              <span className="field-label">Tester instruction</span>
              <textarea className="field-input min-h-24" value={step.tester_instruction} onChange={(event) => updateStep(step.id, { tester_instruction: event.target.value })} />
            </label>
            <label className="mt-3 block">
              <span className="field-label">Client-facing prompt</span>
              <textarea className="field-input min-h-24" value={step.client_prompt} onChange={(event) => updateStep(step.id, { client_prompt: event.target.value })} />
            </label>
            <label className="mt-3 block">
              <span className="field-label">Why this matters</span>
              <textarea className="field-input min-h-20" value={step.why_this_matters} onChange={(event) => updateStep(step.id, { why_this_matters: event.target.value })} />
            </label>
          </div>
        ))}
      </div>}
    </section>
  );
}
