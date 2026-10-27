export type DecodedWav = { samples: number[]; sampleRate: number };

function fourCc(view: DataView, offset: number) {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

/** Decode uncompressed WAV PCM without routing it through an AudioContext resampler. */
export function decodeWavPcm(buffer: ArrayBuffer): DecodedWav | null {
  if (buffer.byteLength < 44) return null;
  const view = new DataView(buffer);
  if (fourCc(view, 0) !== "RIFF" || fourCc(view, 8) !== "WAVE") return null;

  let format = 0; let channels = 0; let sampleRate = 0; let bits = 0; let dataOffset = 0; let dataLength = 0;
  for (let offset = 12; offset + 8 <= view.byteLength;) {
    const id = fourCc(view, offset); const size = view.getUint32(offset + 4, true); const start = offset + 8;
    if (start + size > view.byteLength) return null;
    if (id === "fmt " && size >= 16) {
      format = view.getUint16(start, true); channels = view.getUint16(start + 2, true);
      sampleRate = view.getUint32(start + 4, true); bits = view.getUint16(start + 14, true);
    } else if (id === "data") { dataOffset = start; dataLength = size; }
    offset = start + size + (size % 2);
  }
  if (!dataOffset || !dataLength || !channels || sampleRate < 4000 || sampleRate > 96000) return null;
  if (!((format === 1 && [8, 16, 24, 32].includes(bits)) || (format === 3 && bits === 32))) return null;
  const bytesPerSample = bits / 8; const frameSize = bytesPerSample * channels;
  const frameCount = Math.floor(dataLength / frameSize); if (!frameCount || frameCount > 1_500_000) return null;
  const samples = new Array<number>(frameCount);

  for (let frame = 0; frame < frameCount; frame++) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel++) {
      const at = dataOffset + frame * frameSize + channel * bytesPerSample;
      if (format === 3) sum += view.getFloat32(at, true);
      else if (bits === 8) sum += (view.getUint8(at) - 128) / 128;
      else if (bits === 16) sum += view.getInt16(at, true) / 32768;
      else if (bits === 24) {
        let value = view.getUint8(at) | (view.getUint8(at + 1) << 8) | (view.getUint8(at + 2) << 16);
        if (value & 0x800000) value |= ~0xffffff;
        sum += value / 8388608;
      } else sum += view.getInt32(at, true) / 2147483648;
    }
    samples[frame] = Math.max(-1, Math.min(1, sum / channels));
  }
  return { samples, sampleRate };
}
