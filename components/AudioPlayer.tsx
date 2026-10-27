"use client";

import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Waveform } from "./Waveform";

export function AudioPlayer({ src, peaks, compact = false }: { src: string; peaks: number[]; compact?: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => () => { if (audio.current) audio.current.pause(); }, []);

  const toggle = async () => {
    if (!audio.current) return;
    if (playing) audio.current.pause(); else await audio.current.play();
  };

  return (
    <div className={`audio-player ${compact ? "compact" : ""}`}>
      <audio ref={audio} src={src} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => setProgress(e.currentTarget.duration ? e.currentTarget.currentTime / e.currentTarget.duration : 0)} />
      <button className="play-button" onClick={toggle} aria-label={playing ? "Pause audio" : "Play audio"}>
        {playing ? <Pause size={compact ? 16 : 20} /> : <Play size={compact ? 16 : 20} fill="currentColor" />}
      </button>
      <Waveform peaks={peaks} progress={progress} />
    </div>
  );
}
