"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import type { Cat } from "@/lib/types";
import { CatAvatar } from "./CatAvatar";
import { ProfilePhotoPicker } from "./ProfilePhotoPicker";

export function CatProfilesDialog({ cats, selectedCatId, onSelect, onAdd, onUpdate }: {
  cats: Cat[];
  selectedCatId: string;
  onSelect: (id: string) => void;
  onAdd: (cat: Cat) => void;
  onUpdate: (cat: Cat) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(selectedCatId);
  const [adding, setAdding] = useState(false);
  const current = useMemo(() => cats.find((cat) => cat.id === editingId) || cats[0], [cats, editingId]);
  const [name, setName] = useState("");
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState("");

  const changeOpen = (next: boolean) => {
    if (next) {
      const cat = cats.find((item) => item.id === selectedCatId) || cats[0];
      setAdding(false); setEditingId(cat?.id || ""); setName(cat?.name || ""); setPhoto(cat?.photo); setError("");
    }
    setOpen(next);
  };

  const edit = (cat: Cat) => { setAdding(false); setEditingId(cat.id); setName(cat.name); setPhoto(cat.photo); setError(""); };
  const add = () => { setAdding(true); setName(""); setPhoto(undefined); setError(""); };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Add your cat's name to save their profile."); return; }
    try {
      if (adding) {
        const cat = { id: crypto.randomUUID(), name: name.trim(), photo, createdAt: new Date().toISOString() };
        onAdd(cat); setEditingId(cat.id); setAdding(false);
      } else if (current) onUpdate({ ...current, name: name.trim(), photo });
      setOpen(false);
    } catch { setError("We couldn't save this profile. Check browser storage and try again."); }
  };
  const selected = cats.find((cat) => cat.id === selectedCatId);

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild><button className="header-profile cat-header-profile" aria-label={`Manage cat profiles, selected cat ${selected?.name || "none"}`}><CatAvatar cat={selected} size="sm" /><span>{selected?.name || "Cat"}</span><ChevronDown className="cat-profile-chevron" size={13} /></button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content cat-manager-dialog">
        <Dialog.Close className="dialog-close" aria-label="Close"><X size={19} /></Dialog.Close>
        <p className="eyebrow">Your companions</p><Dialog.Title>Cat profiles</Dialog.Title>
        <Dialog.Description>Choose who is listening, update their profile, or add another cat.</Dialog.Description>
        <div className="cat-manager-list" aria-label="Choose a cat">
          {cats.map((cat) => <button type="button" key={cat.id} className={cat.id === selectedCatId ? "selected" : ""} onClick={() => { onSelect(cat.id); edit(cat); }}><CatAvatar cat={cat} size="sm" /><span>{cat.name}</span>{cat.id === selectedCatId && <Check size={14} />}</button>)}
          <button type="button" className="add" onClick={add}><Plus size={15} />Add cat</button>
        </div>
        <form onSubmit={submit}>
          <ProfilePhotoPicker value={photo} onChange={setPhoto} kind="cat" name={name} />
          <label className="field-label" htmlFor="managed-cat-name">Cat&apos;s name</label>
          <input id="managed-cat-name" className="text-field" value={name} onChange={(event) => setName(event.target.value)} maxLength={40} placeholder="e.g. Miso" />
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          <button className="primary wide" type="submit">{adding ? "Add cat" : "Save cat profile"}</button>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}
