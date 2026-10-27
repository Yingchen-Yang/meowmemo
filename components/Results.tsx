"use client";

import { ArrowLeft, Check, Eye, EyeOff, RotateCcw, Sparkles } from "lucide-react";
import { useState } from "react";
import { CAPTION_VERSION, getCaptionBasis, isSupportedContext } from "@/lib/captions";
import { assignPovCaption } from "@/lib/caption-storage";
import { usePovVisibility } from "@/lib/pov-visibility";
import type { Analysis, CaptionBasis, Cat, OwnerLabel, PreparedAudio, SupportedContext } from "@/lib/types";
import { AudioPlayer } from "./AudioPlayer";
import { CatAvatar } from "./CatAvatar";

const labels: OwnerLabel[] = ["Waiting for food", "Brushing", "Isolation in an unfamiliar room", "Other", "Unknown"];

export type ResultSaveDetails = {
  ownerLabel: OwnerLabel;
  note: string;
  originalInferredContext: OwnerLabel;
  povCaption: string | null;
  povCaptions: Partial<Record<SupportedContext, string>>;
  captionVersion: string;
  captionBasis: CaptionBasis;
};

function contextCopy(analysis: Analysis, displayedContext: OwnerLabel, ownerChanged: boolean) {
  if (ownerChanged) return isSupportedContext(displayedContext) ? `You identified this moment as ${displayedContext.toLowerCase()}.` : "You chose to leave this moment without a specific context.";
  if (analysis.detection === "not_detected" || analysis.detection === "uncertain") return "We couldn't detect a clear meow. Try another recording!";
  if (isSupportedContext(analysis.context_label)) return `This meow may be associated with ${analysis.context_label.toLowerCase()}.`;
  return "We heard your cat! We're just not sure what this meow means yet.";
}

export function Results({ cat, audio, analysis, recordingId, assignedCaptions, onBack, onTryAgain, onSave }: {
  cat: Cat;
  audio: PreparedAudio;
  analysis: Analysis;
  recordingId: string;
  assignedCaptions: Partial<Record<SupportedContext, string>>;
  onBack: () => void;
  onTryAgain: () => void;
  onSave: (details: ResultSaveDetails) => Promise<void>;
}) {
  const inferredContext: OwnerLabel = isSupportedContext(analysis.context_label) ? analysis.context_label : "Unknown";
  const [ownerLabel, setOwnerLabel] = useState<OwnerLabel>(inferredContext);
  const [captions, setCaptions] = useState(assignedCaptions);
  const [note, setNote] = useState("");
  const [manualSave, setManualSave] = useState(false);
  const [captionJobs, setCaptionJobs] = useState(0);
  const [showPov, setShowPov] = usePovVisibility();
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const hasVocalization = analysis.detection === "likely_meow";
  const hasSupportedPrediction = hasVocalization && isSupportedContext(analysis.context_label);
  const ownerChanged = ownerLabel !== inferredContext;
  const caption = isSupportedContext(ownerLabel) ? captions[ownerLabel] || null : null;
  const captionBasis: CaptionBasis = getCaptionBasis(inferredContext, ownerLabel);
  const resultTitle = manualSave ? ownerLabel : analysis.detection === "not_detected" || analysis.detection === "uncertain"
    ? "No clear meow detected"
      : ownerLabel;

  const selectContext = async (label: OwnerLabel) => {
    setOwnerLabel(label);
    if (!isSupportedContext(label) || captions[label]) return;
    setCaptionJobs((count) => count + 1);
    try {
      const assignment = await assignPovCaption(recordingId, label);
      setCaptions((current) => ({ ...current, [label]: assignment.caption }));
    } catch { setSaveError("We couldn't keep a playful caption for this context, but you can still save the recording."); }
    finally { setCaptionJobs((count) => Math.max(0, count - 1)); }
  };

  const save = async () => {
    setSaving(true); setSaveError("");
    try {
      await onSave({ ownerLabel, note, originalInferredContext: inferredContext, povCaption: caption, povCaptions: captions, captionVersion: CAPTION_VERSION, captionBasis });
    } catch {
      setSaveError("This moment couldn't be saved. Free a little browser storage, then try again—your note is still here.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="result-page page-shell">
      <button className="back-button" onClick={onBack}><ArrowLeft size={18} />Back to recording</button>

      <section className="result-shell">
        <div className="result-identity">
          <CatAvatar cat={cat} size="lg" />
          <div><strong>{cat.name}</strong><span>Just now · {audio.duration.toFixed(1)} sec</span></div>
        </div>

        {hasVocalization || manualSave ? (
          <>
            <div className={`result-story ${caption && showPov ? "" : "single-story"}`}>
              <section className="context-card">
                <span className="card-kicker">Possible Context</span>
                <h1>{resultTitle}</h1>
                <p>{contextCopy(analysis, ownerLabel, ownerChanged)}</p>
                <small>Based on a limited set of labeled recordings. This is a suggestion, not a certainty.</small>
              </section>

              {caption && showPov ? (
                <section className="pov-card" aria-live="polite">
                  <span className="card-kicker"><Sparkles size={13} />{cat.name}&apos;s POV · Just for fun</span>
                  <blockquote>“{caption}”</blockquote>
                  <p>Just for Fun · Not a literal translation</p>
                </section>
              ) : null}
            </div>

            <section className="result-audio">
              <div><span className="card-kicker">Your recording</span><small>{audio.duration.toFixed(1)} seconds</small></div>
              <AudioPlayer src={audio.url} peaks={audio.peaks} />
            </section>
          </>
        ) : (
          <section className="no-meow-card">
            <span className="card-kicker">Recording result</span>
            <h1>{resultTitle}</h1>
            <p>We couldn&apos;t confidently detect a cat vocalization in this recording. You can try again or save it with your own context.</p>
            <AudioPlayer src={audio.url} peaks={audio.peaks} />
            <div className="no-meow-actions"><button className="secondary-button" onClick={onTryAgain}><RotateCcw size={16} />Try Again</button><button className="primary" onClick={() => setManualSave(true)}>Save It Anyway</button></div>
          </section>
        )}
      </section>

      {(hasVocalization || manualSave) ? (
        <section className="feedback-card">
          <div className="feedback-intro">
            <p className="eyebrow">Your read matters most</p>
            <h2>{hasSupportedPrediction ? "Correct Context" : "Add Your Own Context"}</h2>
            <p>Choose what was really happening, or leave it Unknown. Your selection becomes the context shown with this memory.</p>
          </div>
          <div className="feedback-fields">
            <div className="label-grid" aria-label="Correct context">
              {labels.map((label) => (
                <button key={label} type="button" className={ownerLabel === label ? "selected" : ""} onClick={() => void selectContext(label)} aria-pressed={ownerLabel === label}>
                  {ownerLabel === label && <Check size={15} />}{label}
                </button>
              ))}
            </div>
            {caption ? <button type="button" className="pov-visibility" onClick={() => setShowPov(!showPov)}>{showPov ? <EyeOff size={14} /> : <Eye size={14} />}{showPov ? "Hide Cat's POV" : "Show Cat's POV"}</button> : null}
            <label className="field-label" htmlFor="note">Owner&apos;s Note <span>optional</span></label>
            <textarea id="note" className="text-field note-field" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} placeholder={`What did ${cat.name} do next?`} />
            <div className="result-actions">
              <button className="primary save-button" onClick={save} disabled={saving || captionJobs > 0}>{saving ? "Saving…" : captionJobs > 0 ? "Choosing caption…" : "Save to Journal"}</button>
              <button className="secondary-button" onClick={onTryAgain}><RotateCcw size={16} />Try Again</button>
            </div>
            {saveError ? <div className="inline-error" role="alert">{saveError}</div> : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
