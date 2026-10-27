"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Download, Share2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { getOwnerContext, getRecordingCaption } from "@/lib/captions";
import { loadImage } from "@/lib/images";
import type { Cat, Recording, UserProfile } from "@/lib/types";

const CARD_WIDTH = 1080;

function rounded(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, fill: string) {
  context.fillStyle = fill; context.beginPath(); context.roundRect(x, y, width, height, radius); context.fill();
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number) {
  const words = text.trim().split(/\s+/); const lines: string[] = []; let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width > width && line) { lines.push(line); line = word; } else line = candidate;
  }
  if (line) lines.push(line); return lines;
}

async function renderShareCard(recording: Recording, cat: Cat | undefined, user: UserProfile | null, includeNote: boolean, includePov: boolean): Promise<Blob> {
  const measureCanvas = document.createElement("canvas"); const measure = measureCanvas.getContext("2d");
  if (!measure) throw new Error("Share card generation is unavailable in this browser.");
  measure.font = "32px Georgia";
  const noteLines = includeNote && recording.note ? wrap(measure, recording.note, 840) : [];
  const contextLabel = getOwnerContext(recording); const caption = includePov ? getRecordingCaption(recording) : null;
  const contentHeight = 750 + (caption ? 290 : 0) + (noteLines.length ? 135 + noteLines.length * 46 : 0);
  const height = Math.max(1330, contentHeight + 120);
  const canvas = document.createElement("canvas"); canvas.width = CARD_WIDTH; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Share card generation is unavailable in this browser.");
  context.fillStyle = "#f7f2e9"; context.fillRect(0, 0, CARD_WIDTH, height);
  context.strokeStyle = "rgba(230,117,85,.18)"; context.lineWidth = 2; context.beginPath(); context.arc(925, 110, 230, 0, Math.PI * 2); context.stroke();
  context.fillStyle = "#2d2a26"; context.font = "700 32px system-ui"; context.fillText("MeowMemo", 90, 100);
  context.fillStyle = "#c9573d"; context.font = "800 17px system-ui"; context.fillText("A MOMENT WORTH REMEMBERING", 90, 155);

  const avatarX = 90, avatarY = 205, avatarSize = 150;
  context.save(); context.beginPath(); context.arc(avatarX + 75, avatarY + 75, 75, 0, Math.PI * 2); context.clip();
  context.fillStyle = "#edc7b5"; context.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  if (cat?.photo) { try { const image = await loadImage(cat.photo); context.drawImage(image, avatarX, avatarY, avatarSize, avatarSize); } catch { /* fallback remains */ } }
  else { context.fillStyle = "#7b3b2c"; context.font = "700 64px Georgia"; context.textAlign = "center"; context.fillText(cat?.name?.slice(0, 1).toUpperCase() || "M", avatarX + 75, avatarY + 98); context.textAlign = "left"; }
  context.restore();
  context.fillStyle = "#2d2a26"; context.font = "500 64px Georgia"; context.fillText(cat?.name || "My cat", 280, 270);
  context.fillStyle = "#7b736b"; context.font = "24px system-ui"; context.fillText(new Date(recording.createdAt).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }), 282, 318);

  rounded(context, 90, 400, 900, 175, 28, "#eee6db");
  context.fillStyle = "#7b736b"; context.font = "800 16px system-ui"; context.fillText("THE SOUND OF THIS MOMENT", 125, 445);
  const peaks = recording.peaks.length ? recording.peaks : [0.08]; const gap = 7; const barWidth = Math.max(3, (830 - gap * (peaks.length - 1)) / peaks.length);
  context.fillStyle = "#e67555";
  peaks.forEach((peak, index) => { const barHeight = Math.max(8, peak * 78); rounded(context, 125 + index * (barWidth + gap), 505 - barHeight / 2, barWidth, barHeight, barWidth / 2, "#e67555"); });

  let y = 625;
  context.fillStyle = "#c9573d"; context.font = "800 16px system-ui"; context.fillText("POSSIBLE CONTEXT", 90, y);
  context.fillStyle = "#2d2a26"; context.font = "500 53px Georgia"; context.fillText(contextLabel, 90, y + 66); y += 125;
  if (caption) {
    rounded(context, 90, y, 900, 245, 30, "#e67555"); context.fillStyle = "#fff7f1"; context.font = "800 16px system-ui"; context.fillText(`${(cat?.name || "CAT").toUpperCase()}'S POV · JUST FOR FUN`, 130, y + 48);
    context.font = "500 42px Georgia"; const captionLines = wrap(context, `“${caption}”`, 810); captionLines.forEach((line, index) => context.fillText(line, 130, y + 112 + index * 50));
    context.font = "20px system-ui"; context.fillStyle = "rgba(255,247,241,.88)"; context.fillText("Playful interpretation, not a literal translation.", 130, y + 210); y += 290;
  }
  if (noteLines.length) {
    const noteHeight = 100 + noteLines.length * 46; rounded(context, 90, y, 900, noteHeight, 26, "#fffdf8");
    context.fillStyle = "#c9573d"; context.font = "800 16px system-ui"; context.fillText(`${user?.displayName ? `${user.displayName.toUpperCase()}'S` : "OWNER'S"} NOTE`, 130, y + 42);
    context.fillStyle = "#5f5852"; context.font = "32px Georgia"; noteLines.forEach((line, index) => context.fillText(line, 130, y + 92 + index * 46)); y += noteHeight + 35;
  }
  context.fillStyle = "#7b736b"; context.font = "19px system-ui"; if (caption) context.fillText("Just for Fun · Not a literal translation", 90, height - 70);
  context.textAlign = "right"; context.fillText("Made privately with MeowMemo", 990, height - 70); context.textAlign = "left";
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be created.")), "image/png"));
}

export function ShareCardDialog({ recording, cat, user }: { recording: Recording; cat?: Cat; user: UserProfile | null }) {
  const [open, setOpen] = useState(false); const [includeNote, setIncludeNote] = useState(Boolean(recording.note));
  const availableCaption = getRecordingCaption(recording); const [includePov, setIncludePov] = useState(Boolean(availableCaption));
  const [preview, setPreview] = useState(""); const [blob, setBlob] = useState<Blob | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return; let active = true; let url = "";
    renderShareCard(recording, cat, user, includeNote, includePov).then((value) => { if (!active) return; setBlob(value); url = URL.createObjectURL(value); setPreview(url); }).catch(() => active && setError("We couldn't create this share card. Try again." )).finally(() => active && setBusy(false));
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [open, includeNote, includePov, recording, cat, user]);
  const filename = `meowmemo-${(cat?.name || "cat").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${recording.createdAt.slice(0, 10)}.png`;
  const changeOpen = (next: boolean) => { if (next) { setIncludeNote(Boolean(recording.note)); setIncludePov(Boolean(availableCaption)); setBusy(true); setError(""); setBlob(null); setPreview(""); } setOpen(next); };
  const download = () => { if (!blob) return; const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 0); };
  const share = async () => {
    if (!blob) return; setError(""); const file = new File([blob], filename, { type: "image/png" });
    if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [file] }))) { setError("Couldn't share this time, but you can still download your image!"); return; }
    try { await navigator.share({ title: `${cat?.name || "My cat"} · MeowMemo`, files: [file] }); }
    catch (caught) { if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Couldn't share this time, but you can still download your image!"); }
  };
  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild><button aria-label={`Share ${cat?.name || "cat"} recording`}><Share2 size={16} /></button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content share-dialog">
        <Dialog.Close className="dialog-close" aria-label="Close"><X size={19} /></Dialog.Close>
        <p className="eyebrow">A shareable memory</p><Dialog.Title>Share card</Dialog.Title>
        <Dialog.Description>Preview the image before saving or sharing. Audio and profile data stay on this device.</Dialog.Description>
        <div className="share-preview">{busy ? <span>Creating preview…</span> : preview ? <>
          {/* eslint-disable-next-line @next/next/no-img-element -- local Blob URL cannot use next/image optimization */}
          <img src={preview} alt={`Share card preview for ${cat?.name || "your cat"}`} />
        </> : null}</div>
        <div className="share-toggles">
          {availableCaption ? <label className="toggle-row"><input type="checkbox" checked={includePov} onChange={(event) => { setBusy(true); setError(""); setIncludePov(event.target.checked); }} /><span>Include Cat&apos;s POV</span></label> : null}
          {recording.note ? <label className="toggle-row"><input type="checkbox" checked={includeNote} onChange={(event) => { setBusy(true); setError(""); setIncludeNote(event.target.checked); }} /><span>Include my note</span></label> : null}
        </div>
        {error ? <div className="inline-error" role="alert">{error}</div> : null}
        <div className="share-actions"><button className="secondary-button" onClick={download} disabled={!blob || busy}><Download size={16} />Download PNG</button><button className="primary" onClick={() => void share()} disabled={!blob || busy}><Share2 size={16} />Share</button></div>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}
