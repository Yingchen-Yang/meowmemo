"""YAMNet-backed first-stage cat-vocalization detection.

The bundled LiteRT model is Google's Apache-2.0 YAMNet release. Its AudioSet
scores are treated as task-specific ranking signals, not calibrated
probabilities. Thresholds were selected on a separate calibration split; see
YAMNET_EVALUATION.md and evaluate_yamnet.py.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Iterable, Literal

import numpy as np
import soxr
from ai_edge_litert.interpreter import Interpreter

MODEL_PATH = Path(__file__).with_name("yamnet.tflite")
CLASS_MAP_PATH = Path(__file__).with_name("yamnet_class_map.csv")
YAMNET_VERSION = "yamnet-tflite-1"
YAMNET_MIN_WAVEFORM_SAMPLES = 15_600

# Selected on the benchmark calibration half. These are score cutoffs, not
# probabilities. A strong Dog prediction veto was also chosen on calibration.
CAT_SCORE_NOT_DETECTED_BELOW = 0.010839
CAT_SCORE_DETECTED_AT_OR_ABOVE = 0.026745
DOG_VETO_MIN_SCORE = 0.5
DOG_VETO_RATIO = 5.0

DetectionStatus = Literal["likely_meow", "uncertain", "not_detected"]


@dataclass(frozen=True)
class DetectionResult:
    status: DetectionStatus
    reason: str


def classify_yamnet_scores(cat_score: float, dog_score: float) -> DetectionResult:
    """Map calibrated YAMNet ranking scores to the three product states."""
    strong_dog_veto = dog_score >= DOG_VETO_MIN_SCORE and dog_score >= DOG_VETO_RATIO * max(cat_score, 1e-9)
    if strong_dog_veto:
        return DetectionResult(
            "not_detected",
            "We couldn't confidently detect a cat vocalization in this recording. Try recording again in a quieter environment.",
        )
    if cat_score >= CAT_SCORE_DETECTED_AT_OR_ABOVE:
        return DetectionResult(
            "likely_meow",
            "The recording contains audio-event evidence consistent with a cat vocalization.",
        )
    if cat_score >= CAT_SCORE_NOT_DETECTED_BELOW:
        return DetectionResult(
            "uncertain",
            "A sound is present, but the cat-vocalization evidence is uncertain. Try another clip with less background noise.",
        )
    return DetectionResult(
        "not_detected",
        "We couldn't confidently detect a cat vocalization in this recording. Try recording again in a quieter environment.",
    )


def _resample_16k(samples: Iterable[float], sample_rate: int) -> np.ndarray:
    values = np.asarray(list(samples), dtype=np.float32)
    if values.size == 0 or sample_rate < 4000:
        raise ValueError("Audio needs at least 4 kHz sample rate and one sample")
    values = np.clip(values, -1.0, 1.0)
    if sample_rate == 16000:
        return values
    return soxr.resample(values, sample_rate, 16000, quality="HQ").astype(np.float32)


class YamNetCatDetector:
    def __init__(self, model_path: Path = MODEL_PATH, class_map_path: Path = CLASS_MAP_PATH):
        self.interpreter = Interpreter(model_path=str(model_path), num_threads=2)
        input_details = self.interpreter.get_input_details()
        output_details = self.interpreter.get_output_details()
        self.input_index = input_details[0]["index"]
        self.scores_index = output_details[0]["index"]
        with class_map_path.open(newline="", encoding="utf-8") as handle:
            classes = {row["display_name"]: int(row["index"]) for row in csv.DictReader(handle)}
        self.cat_index = classes["Cat"]
        self.dog_index = classes["Dog"]
        self._lock = Lock()

    def _score_waveform(self, waveform: np.ndarray) -> tuple[float, float]:
        # YAMNet uses 0.975-second analysis windows. Zero padding preserves a
        # short clip without repeating it or manufacturing acoustic content.
        if waveform.size < YAMNET_MIN_WAVEFORM_SAMPLES:
            waveform = np.pad(waveform, (0, YAMNET_MIN_WAVEFORM_SAMPLES - waveform.size))
        with self._lock:
            self.interpreter.resize_tensor_input(self.input_index, [waveform.size], strict=True)
            self.interpreter.allocate_tensors()
            self.interpreter.set_tensor(self.input_index, waveform)
            self.interpreter.invoke()
            scores = self.interpreter.get_tensor(self.scores_index)

        cat_score = float(np.max(scores[:, self.cat_index]))
        dog_score = float(np.max(scores[:, self.dog_index]))
        return cat_score, dog_score

    def scores(self, samples: Iterable[float], sample_rate: int) -> tuple[float, float]:
        """Return maximum Cat and Dog AudioSet scores for calibration/debugging."""
        waveform = _resample_16k(samples, sample_rate)
        if math.sqrt(float(np.mean(waveform * waveform)) + 1e-12) < 0.0005:
            return 0.0, 0.0
        return self._score_waveform(waveform)

    def detect(self, samples: Iterable[float], sample_rate: int) -> DetectionResult:
        values = list(samples)
        waveform = _resample_16k(values, sample_rate)
        rms = math.sqrt(float(np.mean(waveform * waveform)) + 1e-12)
        if rms < 0.0005:
            return DetectionResult(
                "not_detected",
                "The clip is mostly silent, so there is not enough vocal sound to analyze.",
            )
        cat_score, dog_score = self._score_waveform(waveform)
        return classify_yamnet_scores(cat_score, dog_score)
