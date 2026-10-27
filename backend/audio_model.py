"""Dependency-light acoustic feature extraction and Gaussian classifiers.

The deployed parameters are learned by train_model.py from CatMeows. Raw audio is
never sent to a language model. This intentionally narrow model abstains often.
"""

from __future__ import annotations

import json
import hashlib
import math
import struct
from pathlib import Path
from typing import Iterable

try:
    from .yamnet_detector import YAMNET_VERSION, YamNetCatDetector
except ImportError:
    from yamnet_detector import YAMNET_VERSION, YamNetCatDetector

MODEL_PATH = Path(__file__).with_name("model.json")


def canonical_audio_fingerprint(samples: Iterable[float], sample_rate: int) -> str:
    """Hash canonical 8 kHz PCM16 samples for exact reference identity only."""
    x = [max(-1.0, min(1.0, float(value))) for value in samples]
    if not x or sample_rate < 4000:
        raise ValueError("Audio needs at least 4 kHz sample rate and one sample")
    if sample_rate != 8000:
        out_len = max(1, round(len(x) * 8000 / sample_rate))
        ratio = sample_rate / 8000
        resampled = []
        for index in range(out_len):
            at = index * ratio
            left = min(int(at), len(x) - 1)
            right = min(left + 1, len(x) - 1)
            fraction = at - left
            resampled.append(x[left] * (1 - fraction) + x[right] * fraction)
        x = resampled
    pcm = (
        max(-32768, min(32767, round(value * 32768)))
        for value in x
    )
    payload = struct.pack(f"<{len(x)}h", *pcm)
    return f"pcm16-8k:{hashlib.sha256(payload).hexdigest()}"


def _percentile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    pos = (len(ordered) - 1) * q
    lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
    part = pos - lo
    return ordered[lo] * (1 - part) + ordered[hi] * part


def _frame_starts(length: int, size: int = 256, count: int = 18) -> list[int]:
    if length <= size:
        return [0]
    return [round(i * (length - size) / max(count - 1, 1)) for i in range(count)]


def extract_features(samples: Iterable[float], sample_rate: int) -> list[float]:
    """Extract time, envelope, pitch, and coarse spectral features from real PCM."""
    x = [max(-1.0, min(1.0, float(v))) for v in samples]
    if not x or sample_rate < 4000:
        raise ValueError("Audio needs at least 4 kHz sample rate and one sample")

    # Resample by linear interpolation to the CatMeows training rate.
    target_rate = 8000
    if sample_rate != target_rate:
        out_len = max(1, round(len(x) * target_rate / sample_rate))
        ratio = sample_rate / target_rate
        resampled: list[float] = []
        for i in range(out_len):
            at = i * ratio
            left = min(int(at), len(x) - 1)
            right = min(left + 1, len(x) - 1)
            frac = at - left
            resampled.append(x[left] * (1 - frac) + x[right] * frac)
        x = resampled
        sample_rate = target_rate

    mean = sum(x) / len(x)
    x = [v - mean for v in x]
    peak = max(abs(v) for v in x)
    rms = math.sqrt(sum(v * v for v in x) / len(x) + 1e-12)
    zcr = sum(1 for a, b in zip(x, x[1:]) if (a >= 0) != (b >= 0)) / max(1, len(x) - 1)

    env_size = max(1, sample_rate // 50)
    envelope = [
        math.sqrt(sum(v * v for v in x[i : i + env_size]) / max(1, len(x[i : i + env_size])) + 1e-12)
        for i in range(0, len(x), env_size)
    ]
    env_max = max(envelope)
    active = sum(v > max(env_max * 0.15, 0.003) for v in envelope) / max(1, len(envelope))

    # Pitch salience from normalized autocorrelation across representative frames.
    pitches: list[float] = []
    saliences: list[float] = []
    for start in _frame_starts(len(x), 512, 12):
        frame = x[start : start + 512]
        if len(frame) < 128:
            continue
        energy = sum(v * v for v in frame) + 1e-12
        best_corr, best_lag = 0.0, 0
        for lag in range(8, 81):
            corr = sum(frame[i] * frame[i + lag] for i in range(len(frame) - lag)) / energy
            if corr > best_corr:
                best_corr, best_lag = corr, lag
        if best_lag:
            pitches.append(sample_rate / best_lag)
            saliences.append(best_corr)

    # Goertzel energies provide a small, deterministic spectral representation.
    frequencies = [125, 175, 250, 350, 500, 700, 1000, 1400, 1900, 2600, 3400]
    spectral = [0.0] * len(frequencies)
    frames = _frame_starts(len(x), 256, 18)
    for start in frames:
        frame = x[start : start + 256]
        if len(frame) < 64:
            continue
        for j, freq in enumerate(frequencies):
            coeff = 2 * math.cos(2 * math.pi * freq / sample_rate)
            s1 = s2 = 0.0
            for value in frame:
                s0 = value + coeff * s1 - s2
                s2, s1 = s1, s0
            spectral[j] += s1 * s1 + s2 * s2 - coeff * s1 * s2
    total_spec = sum(spectral) + 1e-12
    spectral = [math.log1p(1000 * value / total_spec) for value in spectral]

    return [
        math.log1p(len(x) / sample_rate),
        math.log1p(rms * 100),
        peak,
        peak / (rms + 1e-8),
        zcr,
        active,
        _percentile(envelope, 0.25),
        _percentile(envelope, 0.5),
        _percentile(envelope, 0.75),
        _percentile(pitches, 0.5) / 1000 if pitches else 0.0,
        _percentile(saliences, 0.5) if saliences else 0.0,
        *spectral,
    ]


def _log_gaussian(features: list[float], mean: list[float], variance: list[float]) -> float:
    return -0.5 * sum(
        math.log(2 * math.pi * max(var, 1e-6)) + ((value - avg) ** 2) / max(var, 1e-6)
        for value, avg, var in zip(features, mean, variance)
    )


ANALYSIS_MODES = {"database_match", "database_plus_ai"}


class MeowModel:
    def __init__(self, path: Path = MODEL_PATH, detector: YamNetCatDetector | None = None):
        with path.open(encoding="utf-8") as handle:
            self.data = json.load(handle)
        self.detector = detector or YamNetCatDetector()
        self._exact_references = {
            reference["fingerprint"]: reference
            for reference in self.data["retrieval"]["references"]
            if reference.get("fingerprint")
        }

    def _database_match(self, features: list[float]) -> str | None:
        """Return a context only for a close, agreeing labeled-example neighborhood."""
        retrieval = self.data["retrieval"]
        profile = self.data["cat_profile"]
        query = [
            (value - mean) / max(std, 1e-5)
            for value, mean, std in zip(features, profile["mean"], profile["std"])
        ]
        neighbors = []
        for reference in retrieval["references"]:
            reference_vector = [
                (value - mean) / max(std, 1e-5)
                for value, mean, std in zip(reference["features"], profile["mean"], profile["std"])
            ]
            distance = math.sqrt(
                sum((left - right) ** 2 for left, right in zip(query, reference_vector)) / len(query)
            )
            neighbors.append((distance, reference["label"]))
        neighbors.sort(key=lambda item: item[0])
        nearest = neighbors[: retrieval["neighbor_count"]]
        counts = {label: sum(candidate == label for _, candidate in nearest) for label in self.data["labels"]}
        winner = max(counts, key=counts.get)
        if nearest[0][0] > retrieval["max_distance"]:
            return None
        if counts[winner] < retrieval["minimum_agreement"]:
            return None
        return winner

    def _acoustic_scores(self, features: list[float]) -> tuple[str, float]:
        scored = []
        for key, profile in self.data["classes"].items():
            scored.append((key, _log_gaussian(features, profile["mean"], profile["variance"]) + math.log(profile["prior"])))
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[0][0], scored[0][1] - scored[1][1]

    def _acoustic_context(self, features: list[float]) -> str | None:
        label, margin = self._acoustic_scores(features)
        policy = self.data["gates"].get("fallback_policy")
        if policy is None:
            # Removing the policy from model.json restores the former global gate.
            return label if margin >= self.data["gates"]["context_margin"] else None
        rule = policy.get(label)
        if not rule or not rule.get("enabled", False):
            return None
        return label if margin >= float(rule["minimum_margin"]) else None

    def analyze(self, samples: list[float], sample_rate: int, analysis_mode: str = "database_plus_ai") -> dict:
        if analysis_mode not in ANALYSIS_MODES:
            raise ValueError(f"Unsupported analysis mode: {analysis_mode}")
        exact_reference = self._exact_references.get(canonical_audio_fingerprint(samples, sample_rate))
        if exact_reference:
            detection = "likely_meow"
            reason = "This audio is an exact PCM match for a verified CatMeows reference recording."
        else:
            detection_result = self.detector.detect(samples, sample_rate)
            detection = detection_result.status
            reason = detection_result.reason

        context = None
        result_source = "none"
        fallback_used = False
        result_evidence = reason
        matched_reference_id = None
        if exact_reference:
            context = exact_reference["label"]
            result_source = "exact_reference_match"
            result_evidence = reason
            matched_reference_id = exact_reference["id"]
        elif detection == "likely_meow":
            # Context features are intentionally not computed until the YAMNet
            # detector has passed the clip through the first-stage gate.
            features = extract_features(samples, sample_rate)
            context = self._database_match(features)
            if context:
                result_source = "database_match"
                result_evidence = "Several close labeled examples agreed on this recording context."
            elif analysis_mode == "database_plus_ai":
                fallback_used = True
                context = self._acoustic_context(features)
                if context:
                    result_source = "acoustic_classifier"
                    result_evidence = "No reliable database match was found, so the acoustic classifier supplied this tentative context."
                else:
                    result_evidence = "The database had no sufficiently close examples, and the acoustic classifier was also inconclusive."
            else:
                result_evidence = "The limited database did not contain a sufficiently close, agreeing set of labeled examples."

        return {
            "detection": detection,
            "analysis_mode": analysis_mode,
            "result_source": result_source,
            "matched_reference_id": matched_reference_id,
            "reference_provenance": "CatMeows 1.0.2 labeled reference" if exact_reference else None,
            "suggested_context": self.data["labels"].get(context, "Unknown"),
            "context": context,
            "context_label": self.data["labels"].get(context) if context else None,
            "evidence": result_evidence,
            "fallback_used": fallback_used,
            "quality": "usable" if detection == "likely_meow" else "limited",
            "model_version": f"{YAMNET_VERSION}+{self.data['version']}",
            "detection_model_version": YAMNET_VERSION,
            "disclaimer": "A tentative acoustic comparison, not a literal translation or an emotion diagnosis.",
        }
