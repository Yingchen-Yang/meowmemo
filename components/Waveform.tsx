"use client";

import { useEffect, useRef } from "react";

export function Waveform({ peaks, progress = 0, live = false }: { peaks: number[]; progress?: number; live?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * ratio; canvas.height = height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.clearRect(0, 0, width, height);
    const gap = 3;
    const barWidth = Math.max(2, (width - (peaks.length - 1) * gap) / peaks.length);
    peaks.forEach((peak, index) => {
      const x = index * (barWidth + gap);
      const barHeight = Math.max(4, peak * (height - 8));
      const played = x / width <= progress;
      ctx.fillStyle = played ? "#2d2a26" : live ? "#e67555" : "#d9cec3";
      ctx.beginPath();
      ctx.roundRect(x, (height - barHeight) / 2, barWidth, barHeight, barWidth / 2);
      ctx.fill();
    });
  }, [peaks, progress, live]);

  return <canvas ref={ref} className="waveform" aria-label="Audio waveform" />;
}
