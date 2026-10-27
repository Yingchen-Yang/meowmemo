"use client";

import { Camera, Trash2, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { optimizeAvatar } from "@/lib/images";

export function ProfilePhotoPicker({ value, onChange, kind, name }: {
  value?: string;
  onChange: (value?: string) => void;
  kind: "user" | "cat";
  name: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const choose = async (file?: File) => {
    if (!file) return;
    setBusy(true); setError("");
    try { onChange(await optimizeAvatar(file)); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "We couldn't use that photo."); }
    finally { setBusy(false); }
  };

  return (
    <div className="profile-photo-field">
      <button type="button" className="photo-picker" onClick={() => input.current?.click()}
        style={value ? { backgroundImage: `url(${value})` } : undefined}
        aria-label={`${value ? "Change" : "Add"} ${kind} profile photo`}>
        {!value && (kind === "user" ? <UserRound size={26} /> : <Camera size={25} />)}
        {!value && <span>{busy ? "Preparing…" : "Add photo"}</span>}
        {value && <span className="photo-change"><Camera size={13} />Change</span>}
      </button>
      <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={(event) => { void choose(event.target.files?.[0]); event.target.value = ""; }} />
      {value ? <button type="button" className="remove-photo" onClick={() => onChange(undefined)}><Trash2 size={13} />Remove photo</button> : null}
      {error ? <p className="field-error" role="alert">{error}</p> : null}
      <span className="sr-only">Photo for {name || kind}</span>
    </div>
  );
}
