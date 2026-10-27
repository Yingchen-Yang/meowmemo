import type { Cat, Recording, UserProfile } from "./types";

const CATS_KEY = "meowmemo.cats.v1";
const RECORDINGS_KEY = "meowmemo.recordings.v1";
const USER_PROFILE_KEY = "meowmemo.user-profile.v1";
const DB_NAME = "meowmemo-audio";
const STORE = "clips";

export function loadCats(): Cat[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(CATS_KEY) || "[]"); } catch { return []; }
}

export function saveCats(cats: Cat[]) { localStorage.setItem(CATS_KEY, JSON.stringify(cats)); }

export function loadRecordings(): Recording[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECORDINGS_KEY) || "[]"); } catch { return []; }
}

export function saveRecordings(recordings: Recording[]) { localStorage.setItem(RECORDINGS_KEY, JSON.stringify(recordings)); }

export function loadUserProfile(): UserProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(localStorage.getItem(USER_PROFILE_KEY) || "null") as UserProfile | null;
    return value?.displayName?.trim() ? value : null;
  } catch { return null; }
}

export function saveUserProfile(profile: UserProfile) {
  localStorage.setItem(USER_PROFILE_KEY, JSON.stringify(profile));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveAudio(id: string, blob: Blob) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put(blob, id);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  db.close();
}

export async function getAudio(id: string): Promise<Blob | null> {
  const db = await openDb();
  const blob = await new Promise<Blob | null>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(id);
    request.onsuccess = () => resolve(request.result || null); request.onerror = () => reject(request.error);
  });
  db.close(); return blob;
}

export async function deleteAudio(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    request.onsuccess = () => resolve(); request.onerror = () => reject(request.error);
  });
  db.close();
}
