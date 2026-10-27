"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Plus, X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { Cat } from "@/lib/types";
import { ProfilePhotoPicker } from "./ProfilePhotoPicker";

export function CatDialog({ onAdd, triggerLabel = "Add a cat" }: { onAdd: (cat: Cat) => void; triggerLabel?: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Add your cat's name to create their profile."); return; }
    try {
      onAdd({ id: crypto.randomUUID(), name: name.trim(), photo, createdAt: new Date().toISOString() });
      setName(""); setPhoto(undefined); setError(""); setOpen(false);
    } catch { setError("We couldn't save this cat profile. Check browser storage and try again."); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild><button className="add-cat"><Plus size={17} />{triggerLabel}</button></Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content">
          <Dialog.Close className="dialog-close" aria-label="Close"><X size={19} /></Dialog.Close>
          <p className="eyebrow">A new companion</p>
          <Dialog.Title>Who are we listening to?</Dialog.Title>
          <Dialog.Description>Profiles keep each cat&apos;s recordings together. Everything stays on this device.</Dialog.Description>
          <form onSubmit={submit}>
            <ProfilePhotoPicker value={photo} onChange={setPhoto} kind="cat" name={name} />
            <label className="field-label" htmlFor="cat-name">Cat&apos;s name</label>
            <input id="cat-name" className="text-field" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Miso" maxLength={40} autoFocus />
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            <button className="primary wide" type="submit" disabled={!name.trim()}>Create profile</button>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
