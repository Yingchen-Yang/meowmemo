"""Compare the existing one-class gate with Google's YAMNet Cat score.

This is an offline evaluation utility, not imported by the FastAPI runtime.
It expects extracted CatMeows, ESC-50, and mini_speech_commands datasets.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import random
import time
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly

from backend.audio_model import MODEL_PATH, extract_features

YAMNET_URL = "https://tfhub.dev/google/yamnet/1"


@dataclass
class Example:
    path: Path | None
    group: str
    positive: bool
    samples: np.ndarray | None = None
    sample_rate: int = 16000

    @property
    def key(self) -> str:
        return str(self.path) if self.path else self.group


def load_mono(example: Example) -> tuple[np.ndarray, int]:
    if example.samples is not None:
        return example.samples.astype(np.float32), example.sample_rate
    samples, rate = sf.read(example.path, dtype="float32", always_2d=False)
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    return np.clip(samples, -1, 1), int(rate)


def at_16k(samples: np.ndarray, rate: int) -> np.ndarray:
    if rate == 16000:
        return samples.astype(np.float32)
    divisor = math.gcd(rate, 16000)
    return resample_poly(samples, 16000 // divisor, rate // divisor).astype(np.float32)


def deterministic_half(example: Example) -> str:
    digest = hashlib.sha256(example.key.encode()).digest()[0]
    return "calibration" if digest % 2 == 0 else "evaluation"


def choose_thresholds(rows: list[dict]) -> tuple[float, float]:
    scores = sorted({row["yamnet_cat_score"] for row in rows})
    positives = [row for row in rows if row["positive"]]
    negatives = [row for row in rows if not row["positive"]]
    high_candidates = []
    for threshold in scores:
        tp = sum(row["yamnet_cat_score"] >= threshold for row in positives)
        fp = sum(row["yamnet_cat_score"] >= threshold for row in negatives)
        fpr = fp / max(1, len(negatives))
        recall = tp / max(1, len(positives))
        precision = tp / max(1, tp + fp)
        if fpr <= 0.05 and precision >= 0.90:
            high_candidates.append((recall, -threshold, threshold))
    high = max(high_candidates, default=(0, 0, 0.5))[2]

    low_candidates = []
    for threshold in scores:
        def rejected(row: dict) -> bool:
            dog_veto = row["yamnet_dog_score"] >= 0.5 and row["yamnet_dog_score"] >= 5 * max(row["yamnet_cat_score"], 1e-9)
            return dog_veto or row["yamnet_cat_score"] < threshold

        false_negative_rate = sum(rejected(row) for row in positives) / max(1, len(positives))
        specificity = sum(rejected(row) for row in negatives) / max(1, len(negatives))
        if false_negative_rate <= 0.095 and specificity >= 0.95 and threshold < high:
            low_candidates.append(threshold)
    low = max(low_candidates, default=min(0.01, high / 2))
    return round(low, 6), round(high, 6)


def state_from_score(score: float, dog_score: float, low: float, high: float) -> str:
    if dog_score >= 0.5 and dog_score >= 5 * max(score, 1e-9):
        return "not_detected"
    if score >= high:
        return "likely_meow"
    if score >= low:
        return "uncertain"
    return "not_detected"


def metrics(rows: list[dict], key: str) -> dict:
    positive = [row for row in rows if row["positive"]]
    negative = [row for row in rows if not row["positive"]]
    tp = sum(row[key] == "likely_meow" for row in positive)
    fp = sum(row[key] == "likely_meow" for row in negative)
    tn = sum(row[key] == "not_detected" for row in negative)
    fn = sum(row[key] == "not_detected" for row in positive)
    uncertain = sum(row[key] == "uncertain" for row in rows)
    return {
        "detected_recall": round(tp / max(1, len(positive)), 4),
        "detected_precision": round(tp / max(1, tp + fp), 4),
        "false_positive_rate": round(fp / max(1, len(negative)), 4),
        "not_detected_specificity": round(tn / max(1, len(negative)), 4),
        "false_negative_rate": round(fn / max(1, len(positive)), 4),
        "uncertain_rate": round(uncertain / max(1, len(rows)), 4),
        "count": len(rows),
    }


def legacy_detection(samples: np.ndarray, sample_rate: int, model_data: dict) -> str:
    """Reproduce the pre-YAMNet one-class gate for an apples-to-apples comparison."""
    features = extract_features(samples.tolist(), sample_rate)
    profile = model_data["cat_profile"]
    standardized = [
        abs(value - mean) / max(std, 1e-5)
        for value, mean, std in zip(features, profile["mean"], profile["std"])
    ]
    manifold_distance = sum(min(value, 6) ** 2 for value in standardized) / len(standardized)
    if features[1] < model_data["gates"]["minimum_log_rms"] or features[5] < 0.03:
        return "not_detected"
    if features[4] > 0.30 and features[10] < 0.15:
        return "not_detected"
    if manifold_distance > model_data["gates"]["outer_distance"] or features[10] < 0.08:
        return "uncertain"
    return "likely_meow"


def build_examples(cat_dir: Path, esc_root: Path, speech_root: Path) -> list[Example]:
    examples = [Example(path, "catmeows", True) for path in sorted(cat_dir.glob("*.wav"))]
    metadata = esc_root / "meta" / "esc50.csv"
    audio_dir = esc_root / "audio"
    by_category: dict[str, list[Path]] = {}
    with metadata.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            by_category.setdefault(row["category"], []).append(audio_dir / row["filename"])
    examples.extend(Example(path, "esc50_cat", True) for path in sorted(by_category["cat"]))
    examples.extend(Example(path, "dog", False) for path in sorted(by_category["dog"]))

    noise_categories = ["rain", "wind", "vacuum_cleaner", "washing_machine", "clock_tick", "keyboard_typing", "siren", "helicopter"]
    environmental = []
    for category in noise_categories:
        environmental.extend(sorted(by_category[category])[:5])
    examples.extend(Example(path, "environmental_noise", False) for path in environmental)

    speech_files = sorted(speech_root.glob("*/*.wav"))
    random.Random(20261026).shuffle(speech_files)
    examples.extend(Example(path, "human_speech", False) for path in speech_files[:80])
    examples.extend(Example(None, f"silence:{index}", False, np.zeros(32000, dtype=np.float32)) for index in range(20))

    # ESC-50 cat clips mixed with real environmental clips at 0 dB signal-to-noise.
    noise_files = environmental * 2
    for cat_path, noise_path in zip(sorted(by_category["cat"]), noise_files):
        cat, cat_rate = load_mono(Example(cat_path, "", True))
        noise, noise_rate = load_mono(Example(noise_path, "", False))
        cat_16 = at_16k(cat, cat_rate)
        noise_16 = at_16k(noise, noise_rate)
        if len(noise_16) < len(cat_16):
            noise_16 = np.resize(noise_16, len(cat_16))
        noise_16 = noise_16[: len(cat_16)]
        cat_rms = np.sqrt(np.mean(cat_16**2) + 1e-12)
        noise_rms = np.sqrt(np.mean(noise_16**2) + 1e-12)
        mixed = np.clip(cat_16 + noise_16 * (cat_rms / noise_rms), -1, 1)
        examples.append(Example(None, f"noisy_cat:{cat_path.name}", True, mixed))
    return examples


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cat-dir", type=Path, required=True)
    parser.add_argument("--esc-root", type=Path, required=True)
    parser.add_argument("--speech-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--tflite", type=Path, help="Evaluate a local LiteRT YAMNet model instead of TensorFlow Hub")
    parser.add_argument("--class-map", type=Path)
    parser.add_argument("--simulate-frontend", action="store_true", help="Apply the browser's nearest-neighbor 8 kHz downsampling before both detectors")
    args = parser.parse_args()

    examples = build_examples(args.cat_dir, args.esc_root, args.speech_root)
    model_data = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    if args.tflite:
        import soxr
        from ai_edge_litert.interpreter import Interpreter

        interpreter = Interpreter(model_path=str(args.tflite), num_threads=2)
        input_index = interpreter.get_input_details()[0]["index"]
        scores_index = interpreter.get_output_details()[0]["index"]

        def score_waveform(waveform: np.ndarray) -> np.ndarray:
            interpreter.resize_tensor_input(input_index, [waveform.size], strict=True)
            interpreter.allocate_tensors()
            interpreter.set_tensor(input_index, waveform)
            interpreter.invoke()
            return interpreter.get_tensor(scores_index)

        if not args.class_map:
            parser.error("--class-map is required with --tflite")
        class_map_path = args.class_map
    else:
        import tensorflow_hub as hub

        yamnet = hub.load(YAMNET_URL)

        def score_waveform(waveform: np.ndarray) -> np.ndarray:
            scores, _, _ = yamnet(waveform)
            return scores.numpy()

        class_map_path = Path(yamnet.class_map_path().numpy().decode())
    # The asset is CSV with a header; parse it rather than assuming a class index.
    with class_map_path.open(newline="", encoding="utf-8") as handle:
        class_rows = list(csv.DictReader(handle))
    class_indexes = {
        name: next(int(row["index"]) for row in class_rows if row["display_name"] == name)
        for name in ("Cat", "Dog", "Speech")
    }

    rows = []
    yamnet_times = []
    current_times = []
    for index, example in enumerate(examples, 1):
        samples, rate = load_mono(example)
        if args.simulate_frontend and rate != 8000:
            ratio = rate / 8000
            output_length = math.floor(len(samples) / ratio)
            positions = np.floor(np.arange(output_length) * ratio).astype(int)
            samples = samples[positions]
            rate = 8000
        started = time.perf_counter()
        current_state = legacy_detection(samples, rate, model_data)
        current_times.append(time.perf_counter() - started)

        waveform = soxr.resample(samples, rate, 16000, quality="HQ").astype(np.float32) if args.tflite else at_16k(samples, rate)
        started = time.perf_counter()
        scores = score_waveform(waveform)
        yamnet_times.append(time.perf_counter() - started)
        cat_scores = scores[:, class_indexes["Cat"]]
        competing_scores = np.maximum(
            scores[:, class_indexes["Dog"]],
            scores[:, class_indexes["Speech"]],
        )
        rows.append({
            "key": example.key,
            "group": example.group.split(":", 1)[0],
            "positive": example.positive,
            "split": deterministic_half(example),
            "current_state": current_state,
            "yamnet_cat_score": float(np.max(cat_scores)),
            "yamnet_cat_mean": float(np.mean(cat_scores)),
            "yamnet_dog_score": float(np.max(scores[:, class_indexes["Dog"]])),
            "yamnet_support": float(np.max(cat_scores - competing_scores)),
        })
        if index % 50 == 0:
            print(f"scored {index}/{len(examples)}", flush=True)

    calibration = [row for row in rows if row["split"] == "calibration"]
    evaluation = [row for row in rows if row["split"] == "evaluation"]
    low, high = choose_thresholds(calibration)
    for row in rows:
        row["yamnet_state"] = state_from_score(row["yamnet_cat_score"], row["yamnet_dog_score"], low, high)

    group_metrics = {}
    for group in sorted({row["group"] for row in rows}):
        group_rows = [row for row in evaluation if row["group"] == group]
        group_metrics[group] = {
            "legacy_detector": metrics(group_rows, "current_state"),
            "yamnet": metrics(group_rows, "yamnet_state"),
            "yamnet_score_min": round(min(row["yamnet_cat_score"] for row in group_rows), 6),
            "yamnet_score_median": round(float(np.median([row["yamnet_cat_score"] for row in group_rows])), 6),
            "yamnet_score_max": round(max(row["yamnet_cat_score"] for row in group_rows), 6),
            "yamnet_support_median": round(float(np.median([row["yamnet_support"] for row in group_rows])), 6),
        }

    report = {
        "yamnet_model": YAMNET_URL,
        "frontend_8khz_simulated": args.simulate_frontend,
        "class_indexes": class_indexes,
        "thresholds": {"not_detected_below": low, "detected_at_or_above": high},
        "calibration": {
            "legacy_detector": metrics(calibration, "current_state"),
            "yamnet": metrics(calibration, "yamnet_state"),
            "count": len(calibration),
        },
        "evaluation": {
            "legacy_detector": metrics(evaluation, "current_state"),
            "yamnet": metrics(evaluation, "yamnet_state"),
            "count": len(evaluation),
        },
        "groups": group_metrics,
        "latency_ms": {
            "legacy_detector_median": round(float(np.median(current_times)) * 1000, 2),
            "yamnet_median": round(float(np.median(yamnet_times)) * 1000, 2),
            "yamnet_p95": round(float(np.percentile(yamnet_times, 95)) * 1000, 2),
        },
        "rows": rows,
    }
    args.output.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps({key: value for key, value in report.items() if key != "rows"}, indent=2))


if __name__ == "__main__":
    main()
