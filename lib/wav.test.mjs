import assert from "node:assert/strict";
import test from "node:test";
import { decodeWavPcm } from "./wav.ts";

function pcm16Wav(samples, sampleRate = 8000, channels = 1) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true); samples.forEach((sample, index) => view.setInt16(44 + index * 2, sample, true));
  return buffer;
}

test("preserves mono PCM16 samples and native sample rate", () => {
  const decoded = decodeWavPcm(pcm16Wav([-32768, -1, 0, 1, 32767]));
  assert.equal(decoded.sampleRate, 8000);
  assert.deepEqual(decoded.samples, [-1, -1 / 32768, 0, 1 / 32768, 32767 / 32768]);
});

test("downmixes stereo PCM16 deterministically", () => {
  const decoded = decodeWavPcm(pcm16Wav([32767, -32768, 16384, 16384], 16000, 2));
  assert.equal(decoded.sampleRate, 16000);
  assert.deepEqual(decoded.samples, [-1 / 65536, 0.5]);
});

test("rejects non-WAV data", () => {
  assert.equal(decodeWavPcm(new ArrayBuffer(44)), null);
});
