"use client";

import { BookOpen, LoaderCircle, LockKeyhole, Mic2, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CatAvatar } from "@/components/CatAvatar";
import { CatDialog } from "@/components/CatDialog";
import { AnalysisModePicker } from "@/components/AnalysisModePicker";
import { Journal } from "@/components/Journal";
import { Recorder } from "@/components/Recorder";
import { Results, type ResultSaveDetails } from "@/components/Results";
import { Onboarding } from "@/components/Onboarding";
import { UserProfileDialog } from "@/components/UserProfileDialog";
import { CatProfilesDialog } from "@/components/CatProfilesDialog";
import { deleteAudio, loadCats, loadRecordings, loadUserProfile, saveAudio, saveCats, saveRecordings, saveUserProfile } from "@/lib/storage";
import type { Analysis, AnalysisMode, Cat, PreparedAudio, Recording, SupportedContext, UserProfile } from "@/lib/types";
import { initializeCaptionState, assignPovCaption } from "@/lib/caption-storage";
import { isSupportedContext } from "@/lib/captions";
import { migrateLegacyRecordingCaptions } from "@/lib/legacy-captions";

type View = "record" | "result" | "journal";
const API_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export default function Home() {
  const [hydrated, setHydrated] = useState(false);
  const [cats, setCats] = useState<Cat[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [selectedCat, setSelectedCat] = useState("");
  const [audio, setAudio] = useState<PreparedAudio | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("database_plus_ai");
  const [view, setView] = useState<View>("record");
  const [analyzing, setAnalyzing] = useState(false);
  const [apiError, setApiError] = useState("");
  const [pendingRecordingId, setPendingRecordingId] = useState("");
  const [pendingCaptions, setPendingCaptions] = useState<Partial<Record<SupportedContext, string>>>({});
  const analyzeInFlight = useRef(false);

  useEffect(() => {
    queueMicrotask(async () => {
      const storedCats = loadCats();
      const migration = migrateLegacyRecordingCaptions(loadRecordings());
      if (migration.changed) { try { saveRecordings(migration.recordings); } catch { /* Keep the migrated text in memory without risking existing storage. */ } }
      try { await initializeCaptionState(migration.recordings); } catch { /* Existing journal data remains the source of truth. */ }
      setCats(storedCats); setRecordings(migration.recordings); setUser(loadUserProfile());
      setSelectedCat(storedCats[0]?.id || ""); setHydrated(true);
    });
  }, []);
  const addCat = (cat: Cat) => { const next = [...cats, cat]; saveCats(next); setCats(next); setSelectedCat(cat.id); };
  const updateCat = (cat: Cat) => { const next = cats.map((item) => item.id === cat.id ? cat : item); saveCats(next); setCats(next); };
  const updateUser = (profile: UserProfile) => { saveUserProfile(profile); setUser(profile); };
  const analyze = async () => {
    if (!audio || !selectedCat || analyzeInFlight.current) return;
    if (!API_URL) { setApiError("MeowMemo's listening service isn't configured yet."); return; }
    analyzeInFlight.current = true; setAnalyzing(true); setApiError("");
    try {
      const response = await fetch(`${API_URL}/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ samples: audio.samples, sample_rate: audio.sampleRate, analysis_mode: analysisMode }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.detail || "The analysis service could not read this clip."); }
      const result: Analysis = await response.json();
      const recordingId = crypto.randomUUID();
      const captions: Partial<Record<SupportedContext, string>> = {};
      if (result.detection === "likely_meow" && isSupportedContext(result.context_label)) {
        try { captions[result.context_label] = (await assignPovCaption(recordingId, result.context_label)).caption; }
        catch { /* The result remains usable without a playful caption. */ }
      }
      setAnalysis(result); setPendingRecordingId(recordingId); setPendingCaptions(captions); setView("result"); window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (caught) { setApiError(caught instanceof TypeError ? "We can't reach MeowMemo's listening service. Check that the local app is running, then try again." : caught instanceof Error ? caught.message : "We couldn't analyze this clip. Please try again."); }
    finally { analyzeInFlight.current = false; setAnalyzing(false); }
  };
  const saveResult = async ({ ownerLabel, note, originalInferredContext, povCaption, povCaptions, captionVersion, captionBasis }: ResultSaveDetails) => {
    if (!audio || !analysis) return;
    const item: Recording = { id: pendingRecordingId || crypto.randomUUID(), catId: selectedCat, createdAt: new Date().toISOString(), duration: audio.duration, mimeType: audio.blob.type, peaks: audio.peaks, analysis, analysisMode: analysis.analysis_mode || analysisMode, analysisSource: analysis.result_source || "none", originalInferredContext, ownerConfirmedContext: ownerLabel === originalInferredContext ? undefined : ownerLabel, povCaption: povCaption || undefined, povCaptions, captionVersion, captionBasis, ownerLabel, note: note.trim() };
    await saveAudio(item.id, audio.blob); const next = [item, ...recordings]; saveRecordings(next); setRecordings(next); URL.revokeObjectURL(audio.url); setAudio(null); setAnalysis(null); setPendingRecordingId(""); setPendingCaptions({}); setView("journal"); window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const remove = async (id: string) => { if (!window.confirm("Delete this recording and its private audio from this device?")) return; try { await deleteAudio(id); const next = recordings.filter((item) => item.id !== id); saveRecordings(next); setRecordings(next); } catch { window.alert("This recording couldn't be deleted. Check browser storage and try again."); } };
  const updateNote = (id: string, note: string) => { const next = recordings.map((item) => item.id === id ? { ...item, note: note.trim() } : item); saveRecordings(next); setRecordings(next); };
  const goRecord = () => { setView("record"); setAnalysis(null); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const retryRecording = () => { if (audio?.url) URL.revokeObjectURL(audio.url); setAudio(null); setPendingRecordingId(""); setPendingCaptions({}); goRecord(); };
  const cat = cats.find((item) => item.id === selectedCat);

  if (!hydrated) return <div className="app-loading"><LoaderCircle className="spin" />Opening your journal…</div>;
  if (!user || !cats.length) return <Onboarding user={user} hasCats={Boolean(cats.length)} onSaveUser={updateUser} onAddCat={addCat} />;
  return (
    <div className="app-root">
      <header className="site-header"><button className="brand" onClick={goRecord}><span className="brand-mark">m</span><span>MeowMemo<small>listen closer</small></span></button><nav aria-label="Primary"><button className={view === "record" || view === "result" ? "active" : ""} onClick={goRecord}><Mic2 size={17} />Record</button><button className={view === "journal" ? "active" : ""} onClick={() => setView("journal")}><BookOpen size={17} />Journal{recordings.length > 0 && <span>{recordings.length}</span>}</button></nav><div className="header-profiles"><UserProfileDialog profile={user} onSave={updateUser} /><CatProfilesDialog cats={cats} selectedCatId={selectedCat} onSelect={setSelectedCat} onAdd={addCat} onUpdate={updateCat} /></div></header>
      {view === "result" && analysis && audio && cat ? <Results cat={cat} audio={audio} analysis={analysis} recordingId={pendingRecordingId} assignedCaptions={pendingCaptions} onBack={goRecord} onTryAgain={retryRecording} onSave={saveResult} /> : view === "journal" ? <Journal cats={cats} recordings={recordings} user={user} onDelete={remove} onNote={updateNote} onRecord={goRecord} /> :
      <main className="record-page page-shell">
        <section className="welcome"><div><p className="eyebrow">Welcome back, {user.displayName}</p><h1>What is {cat?.name}<br /><em>saying today?</em></h1><p>Capture a meow. Notice the pattern. Keep the moment.</p></div><div className="today-note"><span>Today&apos;s gentle reminder</span><p>Let sounds happen naturally—never prompt a meow by causing distress.</p></div></section>
        <section className="cat-strip"><div className="section-heading"><span>1</span><div><h2>Who&apos;s talking?</h2><p>Choose a cat before you record.</p></div></div><div className="cat-list">{cats.map((item) => <button key={item.id} className={`cat-chip ${selectedCat === item.id ? "selected" : ""}`} onClick={() => setSelectedCat(item.id)}><CatAvatar cat={item} /><span>{item.name}</span>{selectedCat === item.id && <small>Listening</small>}</button>)}<CatDialog onAdd={addCat} triggerLabel={cats.length ? "Add another" : "Add your cat"} /></div></section>
        <section className={`record-card ${!selectedCat ? "disabled-card" : ""}`}><div className="section-heading centered"><span>2</span><div><h2>Catch the moment</h2><p>Record or upload 2–15 seconds of clear audio.</p></div></div>{selectedCat ? <Recorder value={audio} onChange={setAudio} /> : <div className="no-cat"><div><Plus /></div><h3>Add a cat to begin</h3><p>Their profile keeps recordings and notes organized.</p><CatDialog onAdd={addCat} triggerLabel="Create a cat profile" /></div>}</section>
        {selectedCat ? <section className="analysis-step"><div className="section-heading"><span>3</span><div><h2>Choose your analysis</h2><p>Cat vocalization detection runs automatically before either option.</p></div></div><AnalysisModePicker value={analysisMode} onChange={setAnalysisMode} /><div className="analyze-wrap"><button className="primary analyze-button" onClick={analyze} disabled={!audio || analyzing}>{analyzing ? <><LoaderCircle className="spin" size={19} />Listening closely…</> : <>Analyze Meow <span>→</span></>}</button><p>{audio ? "Your selection is sent with this clip." : "Record or upload a clip in Step 2 to continue."}</p></div>{apiError ? <div className="inline-error centered-error" role="alert">{apiError}</div> : null}</section> : null}
        <section className="trust-row"><div><span>01</span><p><strong>Real audio in</strong>Your waveform comes from the clip you record.</p></div><div><span>02</span><p><strong>Honest uncertainty</strong>Weak evidence gets an “unsure,” never a guess.</p></div><div><span>03</span><p><strong>Your context counts</strong>You can correct and annotate every result.</p></div></section>
      </main>}
      <footer><span>MeowMemo · a curious companion, not a translator</span><span className="footer-privacy"><span><LockKeyhole size={13} />Private by default</span><span>Audio stays in this browser unless you choose otherwise.</span></span></footer>
    </div>
  );
}
