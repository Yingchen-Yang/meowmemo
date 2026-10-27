"use client";

import { Mic, RotateCcw, Square, Upload } from "lucide-react";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import type { PreparedAudio } from "@/lib/types";
import { decodeWavPcm } from "@/lib/wav";
import { AudioPlayer } from "./AudioPlayer";
import { Waveform } from "./Waveform";

function peaksFromSamples(samples: Float32Array, bars = 64): number[] {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const values = Array.from({ length: bars }, (_, i) => {
    let peak = 0;
    for (let j = i * size; j < Math.min(samples.length, (i + 1) * size); j++) peak = Math.max(peak, Math.abs(samples[j]));
    return peak;
  });
  const max = Math.max(...values, 0.01);
  return values.map((value) => Math.max(0.06, value / max));
}

async function prepare(blob: Blob): Promise<PreparedAudio> {
  const context = new AudioContext();
  try {
    const bytes = await blob.arrayBuffer();
    const nativeWav = decodeWavPcm(bytes);
    const buffer = await context.decodeAudioData(bytes.slice(0));
    const mono = buffer.getChannelData(0);
    const maxSamples = Math.floor(buffer.sampleRate * 15);
    if (buffer.duration < 0.5) throw new Error("That clip is too short. Please provide at least 0.5 seconds.");
    if (buffer.duration > 15.5) throw new Error("That clip is longer than 15 seconds. Please trim it and try again.");
    const clipped = mono.slice(0, maxSamples);
    const targetRate = 8000;
    const ratio = buffer.sampleRate / targetRate;
    const downsampled = Array.from({ length: Math.floor(clipped.length / ratio) }, (_, i) => clipped[Math.floor(i * ratio)]);
    const inference = nativeWav && nativeWav.samples.length / nativeWav.sampleRate <= 15.5
      ? nativeWav
      : { samples: downsampled, sampleRate: targetRate };
    return { blob, url: URL.createObjectURL(blob), duration: buffer.duration, samples: inference.samples, sampleRate: inference.sampleRate, peaks: peaksFromSamples(clipped) };
  } catch (error) {
    if (error instanceof Error && error.message.includes("seconds")) throw error;
    throw new Error("We couldn’t read that audio file. Try WAV, MP3, M4A, or WebM.");
  } finally { await context.close(); }
}

export function Recorder({ value, onChange }: { value: PreparedAudio | null; onChange: (audio: PreparedAudio | null) => void }) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState(() => Array(42).fill(0.08));
  const [error, setError] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserFrame = useRef<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    if (timer.current) clearInterval(timer.current);
    if (analyserFrame.current) cancelAnimationFrame(analyserFrame.current);
    if (value?.url) URL.revokeObjectURL(value.url);
  // value cleanup is intentionally handled only on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = async () => {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { setError("Recording isn’t supported in this browser. You can still upload a clip."); return; }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      stream.current = media;
      const options = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => MediaRecorder.isTypeSupported(type));
      recorder.current = new MediaRecorder(media, options ? { mimeType: options } : undefined);
      chunks.current = [];
      recorder.current.ondataavailable = (event) => { if (event.data.size) chunks.current.push(event.data); };
      recorder.current.onerror = () => { setRecording(false); setError("Recording was interrupted. Try again, or upload a clip instead."); media.getTracks().forEach((track) => track.stop()); };
      recorder.current.onstop = async () => {
        media.getTracks().forEach((track) => track.stop());
        try { onChange(await prepare(new Blob(chunks.current, { type: recorder.current?.mimeType || "audio/webm" }))); }
        catch (caught) { setError(caught instanceof Error ? caught.message : "Recording failed."); }
      };
      recorder.current.start(200); setRecording(true); setSeconds(0);
      timer.current = setInterval(() => setSeconds((current) => { if (current >= 14) { setTimeout(stop, 0); return 15; } return current + 1; }), 1000);
      const audioContext = new AudioContext(); const source = audioContext.createMediaStreamSource(media); const analyser = audioContext.createAnalyser();
      analyser.fftSize = 128; source.connect(analyser); const bins = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => { analyser.getByteFrequencyData(bins); const avg = bins.reduce((a, b) => a + b, 0) / bins.length / 255; setLevels((old) => [...old.slice(1), Math.max(0.07, avg)]); analyserFrame.current = requestAnimationFrame(draw); };
      draw();
    } catch (caught) {
      const denied = caught instanceof DOMException && caught.name === "NotAllowedError";
      setError(denied ? "Microphone access is off. Allow it in your browser settings, or upload a clip instead." : "We couldn’t start the microphone. Check that another app isn’t using it.");
    }
  };
  const stop = () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    setRecording(false); if (timer.current) clearInterval(timer.current); timer.current = null;
    if (analyserFrame.current) cancelAnimationFrame(analyserFrame.current);
  };
  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return; setError("");
    if (file.size > 15_000_000) { setError("That file is too large. Choose a clip under 15 MB."); return; }
    try { onChange(await prepare(file)); } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not read that clip."); }
    event.target.value = "";
  };
  const discard = () => { if (value?.url) URL.revokeObjectURL(value.url); onChange(null); setSeconds(0); setLevels(Array(42).fill(0.08)); };

  if (value) return (
    <div className="record-ready">
      <div className="ready-top"><span className="status-dot" />Ready to listen <span>{value.duration.toFixed(1)}s</span></div>
      <AudioPlayer src={value.url} peaks={value.peaks} />
      <button className="text-button" onClick={discard}><RotateCcw size={16} />Record again</button>
    </div>
  );

  return (
    <div className="recorder">
      <p className="timer">0:{String(seconds).padStart(2, "0")} <span>/ 0:15</span></p>
      <div className="live-wave"><Waveform peaks={levels} live /></div>
      <button className={`record-button ${recording ? "recording" : ""}`} onClick={recording ? stop : start} aria-label={recording ? "Stop recording" : "Start recording"}>
        {recording ? <Square size={30} fill="currentColor" /> : <Mic size={34} />}
      </button>
      <p className="record-hint">{recording ? "Listening… tap to stop" : "Tap when your cat starts talking"}</p>
      <div className="or"><span />or<span /></div>
      <button className="upload-button" onClick={() => fileRef.current?.click()}><Upload size={17} />Upload a clip</button>
      <input ref={fileRef} hidden type="file" accept="audio/*,.wav,.mp3,.m4a,.webm,.ogg" onChange={upload} />
      {error && <div className="inline-error" role="alert">{error}</div>}
    </div>
  );
}
