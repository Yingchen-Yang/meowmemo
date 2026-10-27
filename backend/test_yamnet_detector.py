import unittest
import math

from backend.yamnet_detector import (
    CAT_SCORE_DETECTED_AT_OR_ABOVE,
    CAT_SCORE_NOT_DETECTED_BELOW,
    DOG_VETO_MIN_SCORE,
    YamNetCatDetector,
    classify_yamnet_scores,
)


class YamNetDetectorTests(unittest.TestCase):
    def test_high_cat_score_is_detected(self):
        result = classify_yamnet_scores(CAT_SCORE_DETECTED_AT_OR_ABOVE + 0.01, 0.001)
        self.assertEqual(result.status, "likely_meow")

    def test_middle_cat_score_is_uncertain(self):
        middle = (CAT_SCORE_NOT_DETECTED_BELOW + CAT_SCORE_DETECTED_AT_OR_ABOVE) / 2
        self.assertEqual(classify_yamnet_scores(middle, 0.001).status, "uncertain")

    def test_low_cat_score_is_not_detected(self):
        self.assertEqual(classify_yamnet_scores(0.0, 0.001).status, "not_detected")

    def test_strong_dog_prediction_vetoes_cat_score(self):
        result = classify_yamnet_scores(CAT_SCORE_DETECTED_AT_OR_ABOVE + 0.01, DOG_VETO_MIN_SCORE + 0.2)
        self.assertEqual(result.status, "not_detected")

    def test_bundled_model_returns_not_detected_for_silence(self):
        detector = YamNetCatDetector()
        result = detector.detect([0.0] * 32000, 16000)
        self.assertEqual(result.status, "not_detected")

    def test_half_second_audio_is_zero_padded_and_processed(self):
        detector = YamNetCatDetector()
        tone = [0.1 * math.sin(2 * math.pi * 440 * index / 8000) for index in range(4000)]
        result = detector.detect(tone, 8000)
        self.assertIn(result.status, {"likely_meow", "uncertain", "not_detected"})


if __name__ == "__main__":
    unittest.main()
