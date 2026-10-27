"use client";

import { ArrowLeft, ArrowRight, Heart, ShieldCheck } from "lucide-react";
import { FormEvent, useState } from "react";
import type { Cat, UserProfile } from "@/lib/types";
import { ProfilePhotoPicker } from "./ProfilePhotoPicker";

export function Onboarding({ user, hasCats, onSaveUser, onAddCat }: {
  user: UserProfile | null;
  hasCats: boolean;
  onSaveUser: (profile: UserProfile) => void;
  onAddCat: (cat: Cat) => void;
}) {
  const [step, setStep] = useState<"user" | "cat">(user ? "cat" : "user");
  const [userName, setUserName] = useState(user?.displayName || "");
  const [userPhoto, setUserPhoto] = useState(user?.avatar);
  const [catName, setCatName] = useState("");
  const [catPhoto, setCatPhoto] = useState<string>();
  const [error, setError] = useState("");

  const saveUser = (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!userName.trim()) { setError("Tell us what to call you."); return; }
    const now = new Date().toISOString();
    try {
      onSaveUser({ id: user?.id || crypto.randomUUID(), displayName: userName.trim(), avatar: userPhoto, createdAt: user?.createdAt || now, updatedAt: now });
      if (!hasCats) setStep("cat");
    } catch { setError("We couldn't save your profile. Check browser storage and try again."); }
  };

  const saveCat = (event: FormEvent) => {
    event.preventDefault(); setError("");
    if (!catName.trim()) { setError("Add your cat's name to continue."); return; }
    try { onAddCat({ id: crypto.randomUUID(), name: catName.trim(), photo: catPhoto, createdAt: new Date().toISOString() }); }
    catch { setError("We couldn't save this cat profile. Check browser storage and try again."); }
  };

  return (
    <main className="onboarding-page">
      <section className="onboarding-card">
        <div className="onboarding-brand"><span className="brand-mark">m</span><strong>MeowMemo</strong></div>
        <div className="onboarding-progress" aria-label={`Onboarding step ${step === "user" ? 1 : 2} of 2`}><span className="active" /><span className={step === "cat" ? "active" : ""} /><small>{step === "user" ? "1" : "2"} of 2</small></div>
        {step === "user" ? (
          <form onSubmit={saveUser} className="onboarding-form">
            <p className="eyebrow">Welcome home</p><h1>A little journal for every meow.</h1>
            <p className="onboarding-lead">Keep the sounds, routines, and tiny moments you share with your cat—privately on this device.</p>
            <ProfilePhotoPicker value={userPhoto} onChange={setUserPhoto} kind="user" name={userName} />
            <label className="field-label" htmlFor="onboarding-user-name">What should we call you?</label>
            <input id="onboarding-user-name" className="text-field" value={userName} onChange={(event) => setUserName(event.target.value)} placeholder="Your name" maxLength={50} autoFocus />
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            <button className="primary wide onboarding-action" type="submit">Continue <ArrowRight size={17} /></button>
          </form>
        ) : (
          <form onSubmit={saveCat} className="onboarding-form">
            <button type="button" className="back-button onboarding-back" onClick={() => setStep("user")}><ArrowLeft size={16} />Back</button>
            <p className="eyebrow">Meet your cat</p><h1>Who are we listening to?</h1>
            <p className="onboarding-lead">Their profile keeps recordings, notes, and playful interpretations together.</p>
            <ProfilePhotoPicker value={catPhoto} onChange={setCatPhoto} kind="cat" name={catName} />
            <label className="field-label" htmlFor="onboarding-cat-name">Cat&apos;s name</label>
            <input id="onboarding-cat-name" className="text-field" value={catName} onChange={(event) => setCatName(event.target.value)} placeholder="e.g. Miso" maxLength={40} autoFocus />
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            <button className="primary wide onboarding-action" type="submit">Start MeowMemo <Heart size={17} /></button>
          </form>
        )}
        <p className="onboarding-privacy"><ShieldCheck size={15} />No account needed. Your profiles and recordings stay in this browser.</p>
      </section>
    </main>
  );
}
