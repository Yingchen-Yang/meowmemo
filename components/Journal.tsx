"use client";

import { CalendarDays, ChevronDown, Eye, EyeOff, Pencil, Search, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getOwnerContext, getRecordingCaption } from "@/lib/captions";
import { usePovVisibility } from "@/lib/pov-visibility";
import type { Cat, Recording, UserProfile } from "@/lib/types";
import { getAudio } from "@/lib/storage";
import { AudioPlayer } from "./AudioPlayer";
import { CatAvatar } from "./CatAvatar";
import { ShareCardDialog } from "./ShareCardDialog";

function JournalItem({ recording, cat, user, onDelete, onNote }: { recording: Recording; cat?: Cat; user: UserProfile | null; onDelete: () => void; onNote: (note: string) => void }) {
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(recording.note);
  const [noteError, setNoteError] = useState("");
  const [showPov, setShowPov] = usePovVisibility();
  useEffect(() => {
    let objectUrl = "";
    getAudio(recording.id).then((blob) => {
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); }
    });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [recording.id]);

  const date = new Date(recording.createdAt);
  const ownerContext = getOwnerContext(recording);
  const caption = getRecordingCaption(recording);

  return (
    <article className="journal-item">
      <div className="journal-date"><span>{date.toLocaleDateString(undefined, { month: "short" })}</span><strong>{date.getDate()}</strong></div>
      <div className="journal-main">
        <div className="journal-heading">
          <div><CatAvatar cat={cat} size="sm" /><span><strong>{cat?.name || "Deleted cat"}</strong><small>{date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {recording.duration.toFixed(1)} sec</small></span></div>
          <span className="owner-label">{ownerContext}</span>
        </div>

        {url ? <AudioPlayer src={url} peaks={recording.peaks} compact /> : <div className="audio-loading">Loading private audio…</div>}

        <div className="journal-details">
          <section className="journal-context">
            <span>Possible context</span>
            <strong>{ownerContext}</strong>
          </section>

          {caption && showPov ? (
            <section className="journal-pov">
              <span><Sparkles size={12} />{cat?.name || "Cat"}&apos;s POV · Just for fun</span>
              <blockquote>“{caption}”</blockquote>
              <div className="journal-pov-footer">
                <small>Just for Fun · Not a literal translation</small>
                <button type="button" className="pov-visibility" onClick={() => setShowPov(false)}><EyeOff size={13} />Hide Cat&apos;s POV</button>
              </div>
            </section>
          ) : null}
        </div>
        {caption && !showPov ? <button type="button" className="pov-visibility journal-pov-toggle" onClick={() => setShowPov(true)}><Eye size={13} />Show Cat&apos;s POV</button> : null}

        {editing ? (
          <div className="note-editor"><textarea className="text-field" value={note} onChange={(event) => setNote(event.target.value)} maxLength={400} /><button className="small-button" onClick={() => { try { onNote(note); setEditing(false); setNoteError(""); } catch { setNoteError("Your note couldn't be saved. Check browser storage and try again."); } }}>Save note</button>{noteError ? <p className="field-error" role="alert">{noteError}</p> : null}</div>
        ) : recording.note ? (
          <div className="journal-note"><span>{user?.displayName ? `${user.displayName}'s note` : "Owner's note"}</span><p>{recording.note}</p></div>
        ) : null}
      </div>
      <div className="item-actions"><ShareCardDialog recording={recording} cat={cat} user={user} /><button onClick={() => setEditing(!editing)} aria-label="Edit note"><Pencil size={16} /></button><button onClick={onDelete} aria-label="Delete recording"><Trash2 size={16} /></button></div>
    </article>
  );
}

export function Journal({ cats, recordings, user, onDelete, onNote, onRecord }: { cats: Cat[]; recordings: Recording[]; user: UserProfile | null; onDelete: (id: string) => void; onNote: (id: string, note: string) => void; onRecord: () => void }) {
  const [catFilter, setCatFilter] = useState("all");
  const [labelFilter, setLabelFilter] = useState("all");
  const [query, setQuery] = useState("");
  const labels = Array.from(new Set(recordings.map((item) => getOwnerContext(item))));
  const filtered = useMemo(() => recordings.filter((item) => {
    const ownerContext = getOwnerContext(item);
    return (catFilter === "all" || item.catId === catFilter)
      && (labelFilter === "all" || ownerContext === labelFilter)
      && (!query || item.note.toLowerCase().includes(query.toLowerCase()) || cats.find((cat) => cat.id === item.catId)?.name.toLowerCase().includes(query.toLowerCase()));
  }), [recordings, catFilter, labelFilter, query, cats]);

  return (
    <main className="journal-page page-shell">
      <div className="journal-title"><div><p className="eyebrow"><CalendarDays size={14} />Private, on this device</p><h1>The meow journal</h1><p>A small record of the sounds, routines, and moments you share.</p></div><button className="primary" onClick={onRecord}>Record a moment</button></div>
      <div className="filters">
        <label className="search-box"><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search notes or cats" /></label>
        <label className="select-box"><select value={catFilter} onChange={(event) => setCatFilter(event.target.value)}><option value="all">All cats</option>{cats.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}</select><ChevronDown size={16} /></label>
        <label className="select-box"><select value={labelFilter} onChange={(event) => setLabelFilter(event.target.value)}><option value="all">All contexts</option>{labels.map((label) => <option key={label} value={label}>{label}</option>)}</select><ChevronDown size={16} /></label>
      </div>
      <div className="journal-list">
        {filtered.map((recording) => <JournalItem key={recording.id} recording={recording} cat={cats.find((cat) => cat.id === recording.catId)} user={user} onDelete={() => onDelete(recording.id)} onNote={(updatedNote) => onNote(recording.id, updatedNote)} />)}
        {!filtered.length && <div className="empty-state"><div className="empty-mark">m</div><h2>{recordings.length ? "No moments match" : "Your first meow belongs here"}</h2><p>{recordings.length ? "Try widening the filters or searching a different note." : "Record a short clip, add what you noticed, and begin a private history of your cat’s voice."}</p>{!recordings.length && <button className="primary" onClick={onRecord}>Record the first moment</button>}</div>}
      </div>
    </main>
  );
}
