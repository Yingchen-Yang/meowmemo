"""Train and evaluate the CatMeows Gaussian baseline without external ML packages."""

from __future__ import annotations

import argparse
import json
import math
import random
import wave
from collections import Counter
from pathlib import Path
from statistics import fmean

from audio_model import canonical_audio_fingerprint, extract_features

LABELS = {"B": "Brushing", "F": "Waiting for food", "I": "Isolation in an unfamiliar room"}


def wav_samples(path: Path) -> tuple[list[float], int]:
    with wave.open(str(path), "rb") as audio:
        if audio.getsampwidth() != 2 or audio.getnchannels() != 1:
            raise ValueError(f"Expected mono 16-bit PCM: {path}")
        raw = audio.readframes(audio.getnframes())
        values = [int.from_bytes(raw[i : i + 2], "little", signed=True) / 32768 for i in range(0, len(raw), 2)]
        return values, audio.getframerate()


def stats(rows: list[list[float]]) -> tuple[list[float], list[float]]:
    means = [fmean(column) for column in zip(*rows)]
    variances = [fmean((row[i] - means[i]) ** 2 for row in rows) + 1e-5 for i in range(len(means))]
    return means, variances


def fit(rows: list[dict]) -> dict:
    all_features = [row["features"] for row in rows]
    mean, variance = stats(all_features)
    classes = {}
    for label in LABELS:
        group = [row["features"] for row in rows if row["label"] == label]
        group_mean, group_variance = stats(group)
        classes[label] = {"mean": group_mean, "variance": group_variance, "prior": len(group) / len(rows)}
    return {"classes": classes, "global_mean": mean, "global_variance": variance}


def predict(features: list[float], model: dict) -> str:
    scores = []
    for label, profile in model["classes"].items():
        score = math.log(profile["prior"]) - 0.5 * sum(
            math.log(2 * math.pi * v) + ((x - m) ** 2) / v
            for x, m, v in zip(features, profile["mean"], profile["variance"])
        )
        scores.append((score, label))
    return max(scores)[1]


def predict_with_margin(features: list[float], model: dict) -> tuple[str, float]:
    scores = []
    for label, profile in model["classes"].items():
        score = math.log(profile["prior"]) - 0.5 * sum(
            math.log(2 * math.pi * v) + ((x - m) ** 2) / v
            for x, m, v in zip(features, profile["mean"], profile["variance"])
        )
        scores.append((score, label))
    scores.sort(reverse=True)
    return scores[0][1], scores[0][0] - scores[1][0]


def evaluate_by_cat(rows: list[dict]) -> dict:
    confusion = {actual: {pred: 0 for pred in LABELS} for actual in LABELS}
    confident: list[bool] = []
    for cat in sorted({row["cat"] for row in rows}):
        train = [row for row in rows if row["cat"] != cat]
        test = [row for row in rows if row["cat"] == cat]
        model = fit(train)
        for row in test:
            predicted, margin = predict_with_margin(row["features"], model)
            confusion[row["label"]][predicted] += 1
            if margin >= 6.0:
                confident.append(predicted == row["label"])
    f1s = []
    for label in LABELS:
        tp = confusion[label][label]
        fp = sum(confusion[actual][label] for actual in LABELS if actual != label)
        fn = sum(confusion[label][pred] for pred in LABELS if pred != label)
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        f1s.append(2 * precision * recall / (precision + recall) if precision + recall else 0)
    return {
        "macro_f1": sum(f1s) / len(f1s),
        "confusion": confusion,
        "abstention_threshold": 6.0,
        "context_coverage": len(confident) / len(rows),
        "accuracy_when_context_shown": sum(confident) / len(confident) if confident else 0,
    }


def evaluate_retrieval_by_cat(rows: list[dict]) -> dict:
    decisions: list[bool] = []
    for cat in sorted({row["cat"] for row in rows}):
        train = [row for row in rows if row["cat"] != cat]
        test = [row for row in rows if row["cat"] == cat]
        mean, variance = stats([row["features"] for row in train])
        std = [math.sqrt(value) for value in variance]
        references = [
            ([(value - center) / scale for value, center, scale in zip(row["features"], mean, std)], row["label"])
            for row in train
        ]
        for row in test:
            query = [(value - center) / scale for value, center, scale in zip(row["features"], mean, std)]
            nearest = sorted(
                (
                    math.sqrt(sum((left - right) ** 2 for left, right in zip(query, reference)) / len(query)),
                    label,
                )
                for reference, label in references
            )[:5]
            counts = {label: sum(candidate == label for _, candidate in nearest) for label in LABELS}
            winner = max(counts, key=counts.get)
            if nearest[0][0] <= 0.40 and counts[winner] >= 4:
                decisions.append(winner == row["label"])
    return {
        "method": "5-nearest labeled examples after training-fold standardization",
        "maximum_distance": 0.40,
        "minimum_agreement": "4 of 5",
        "context_coverage": len(decisions) / len(rows),
        "accuracy_when_context_shown": sum(decisions) / len(decisions) if decisions else 0,
        "matched_clip_count": len(decisions),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("model.json"))
    args = parser.parse_args()

    rows = []
    for path in sorted(args.dataset.glob("*.wav")):
        parts = path.stem.split("_")
        samples, rate = wav_samples(path)
        rows.append({"id": path.stem, "label": parts[0], "cat": parts[1], "features": extract_features(samples, rate), "fingerprint": canonical_audio_fingerprint(samples, rate)})
    if len(rows) != 440:
        raise SystemExit(f"Expected 440 clips; found {len(rows)}")

    evaluation = evaluate_by_cat(rows)
    retrieval_evaluation = evaluate_retrieval_by_cat(rows)
    model = fit(rows)
    std = [math.sqrt(value) for value in model["global_variance"]]
    distances = [sum(((v - m) / s) ** 2 for v, m, s in zip(row["features"], model["global_mean"], std)) / len(std) for row in rows]
    log_rms = sorted(row["features"][1] for row in rows)
    output = {
        "version": "catmeows-retrieval-gnb-2.2.0",
        "trained_on": "CatMeows 1.0.2 (440 clips, 21 cats)",
        "labels": LABELS,
        "feature_count": len(rows[0]["features"]),
        "cat_profile": {"mean": model["global_mean"], "std": std},
        "classes": model["classes"],
        "retrieval": {
            "neighbor_count": 5,
            "minimum_agreement": 4,
            "max_distance": 0.40,
            "references": [
                {"id": row["id"], "cat": row["cat"], "label": row["label"], "features": row["features"], "fingerprint": row["fingerprint"]}
                for row in rows
            ],
            "evaluation": retrieval_evaluation,
        },
        "gates": {
            "minimum_log_rms": log_rms[max(0, round(len(log_rms) * 0.01) - 1)] * 0.25,
            "outer_distance": sorted(distances)[round(len(distances) * 0.975) - 1] * 1.35,
            "context_margin": 6.0,
            "fallback_policy": {
                "B": {"enabled": True, "minimum_margin": 4.0},
                "F": {"enabled": False, "minimum_margin": 6.0},
                "I": {"enabled": True, "minimum_margin": 0.0},
            },
        },
        "evaluation": evaluation,
        "training_counts": Counter(row["label"] for row in rows),
        "split": "Leave-one-cat-out; all clips for a cat are held out together.",
        "limitations": "No non-cat training set; detector is a one-class acoustic similarity screen. Context labels are recording conditions, not intent or emotion.",
    }
    args.output.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(evaluation, indent=2))


if __name__ == "__main__":
    random.seed(0)
    main()
