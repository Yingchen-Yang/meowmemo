"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { FormEvent, useState } from "react";
import type { UserProfile } from "@/lib/types";
import { ProfilePhotoPicker } from "./ProfilePhotoPicker";
import { UserAvatar } from "./UserAvatar";

export function UserProfileDialog({ profile, onSave }: { profile: UserProfile; onSave: (profile: UserProfile) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(profile.displayName);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [error, setError] = useState("");
  const changeOpen = (next: boolean) => {
    if (next) { setName(profile.displayName); setAvatar(profile.avatar); setError(""); }
    setOpen(next);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) { setError("Add your name to save your profile."); return; }
    try {
      onSave({ ...profile, displayName: name.trim(), avatar, updatedAt: new Date().toISOString() });
      setOpen(false);
    } catch { setError("Your profile couldn't be saved. Check browser storage and try again."); }
  };

  return (
    <Dialog.Root open={open} onOpenChange={changeOpen}>
      <Dialog.Trigger asChild><button className="header-profile" aria-label={`Edit my profile, ${profile.displayName}`}><UserAvatar profile={profile} /><span>{profile.displayName}</span></button></Dialog.Trigger>
      <Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content profile-dialog">
        <Dialog.Close className="dialog-close" aria-label="Close"><X size={19} /></Dialog.Close>
        <p className="eyebrow">Your profile</p><Dialog.Title>Edit my profile</Dialog.Title>
        <Dialog.Description>Your name is used only on this device and on share cards you choose to make.</Dialog.Description>
        <form onSubmit={submit}>
          <ProfilePhotoPicker value={avatar} onChange={setAvatar} kind="user" name={name} />
          <label className="field-label" htmlFor="user-profile-name">Your name</label>
          <input id="user-profile-name" className="text-field" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} autoFocus />
          {error ? <div className="inline-error" role="alert">{error}</div> : null}
          <button className="primary wide" type="submit">Save profile</button>
        </form>
      </Dialog.Content></Dialog.Portal>
    </Dialog.Root>
  );
}
