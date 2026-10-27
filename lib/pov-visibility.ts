"use client";

import { useSyncExternalStore } from "react";

const KEY = "meowmemo.show-pov.v1";
const EVENT = "meowmemo-pov-visibility";

function subscribe(notify: () => void) {
  window.addEventListener(EVENT, notify); window.addEventListener("storage", notify);
  return () => { window.removeEventListener(EVENT, notify); window.removeEventListener("storage", notify); };
}

function snapshot() { try { return localStorage.getItem(KEY) !== "false"; } catch { return true; } }

export function usePovVisibility() {
  const showPov = useSyncExternalStore(
    subscribe,
    snapshot,
    () => true,
  );
  const setShowPov = (show: boolean) => {
    try { localStorage.setItem(KEY, String(show)); } catch { /* Keep the in-memory preference. */ }
    window.dispatchEvent(new Event(EVENT));
  };
  return [showPov, setShowPov] as const;
}
