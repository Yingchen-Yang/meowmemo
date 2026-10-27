"""Add exact canonical PCM fingerprints to an existing MeowMemo reference index."""

from __future__ import annotations

import argparse
import json
import wave
from pathlib import Path

try:
    from .audio_model import canonical_audio_fingerprint
except ImportError:
    from audio_model import canonical_audio_fingerprint


def read_wav(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as audio:
        if audio.getnchannels() != 1 or audio.getsampwidth() != 2:
            raise ValueError(f"Expected mono PCM16 WAV: {path}")
        raw = audio.readframes(audio.getnframes())
        samples = [
            int.from_bytes(raw[index : index + 2], "little", signed=True) / 32768
            for index in range(0, len(raw), 2)
        ]
        return samples, audio.getframerate()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--model", type=Path, default=Path(__file__).with_name("model.json"))
    args = parser.parse_args()

    data = json.loads(args.model.read_text(encoding="utf-8"))
    files = {path.stem: path for path in args.dataset.glob("*.wav")}
    references = data["retrieval"]["references"]
    if set(files) != {reference["id"] for reference in references}:
        raise SystemExit("Dataset files do not exactly match the deployed reference index")

    fingerprints: set[str] = set()
    for reference in references:
        samples, sample_rate = read_wav(files[reference["id"]])
        fingerprint = canonical_audio_fingerprint(samples, sample_rate)
        if fingerprint in fingerprints:
            raise SystemExit(f"Duplicate reference audio: {reference['id']}")
        fingerprints.add(fingerprint)
        reference["fingerprint"] = fingerprint

    data["version"] = "catmeows-retrieval-gnb-2.1.0"
    args.model.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"Indexed {len(fingerprints)} exact reference fingerprints")


if __name__ == "__main__":
    main()
