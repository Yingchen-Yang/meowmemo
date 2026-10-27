import math
import unittest
from unittest.mock import patch

from backend.audio_model import MeowModel, canonical_audio_fingerprint, extract_features
from backend.yamnet_detector import DetectionResult


class AudioModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.model = MeowModel()

    def _reference_for(self, *, database_match: bool, acoustic_match: bool | None = None) -> list[float]:
        for reference in self.model.data["retrieval"]["references"]:
            features = reference["features"]
            database_context = self.model._database_match(features)
            acoustic_context = self.model._acoustic_context(features)
            if bool(database_context) != database_match:
                continue
            if acoustic_match is not None and bool(acoustic_context) != acoustic_match:
                continue
            return features
        self.fail("No stored reference satisfies the requested routing scenario")

    def test_valid_cat_audio_with_database_match(self):
        features = self._reference_for(database_match=True)
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("likely_meow", "supported")), patch("backend.audio_model.extract_features", return_value=features):
            result = self.model.analyze([0.1] * 16000, 8000, "database_match")
        self.assertEqual(result["detection"], "likely_meow")
        self.assertEqual(result["analysis_mode"], "database_match")
        self.assertEqual(result["result_source"], "database_match")
        self.assertNotEqual(result["suggested_context"], "Unknown")
        self.assertFalse(result["fallback_used"])

    def test_exact_reference_match_bypasses_detector_with_provenance(self):
        samples = [0.1, -0.2, 0.3] * 2000
        reference = self.model.data["retrieval"]["references"][0]
        self.model._exact_references = {canonical_audio_fingerprint(samples, 8000): reference}
        with patch.object(self.model.detector, "detect", side_effect=AssertionError("exact references bypass detection")), patch("backend.audio_model.extract_features", side_effect=AssertionError("exact references bypass retrieval")):
            result = self.model.analyze(samples, 8000, "database_match")
        self.assertEqual(result["detection"], "likely_meow")
        self.assertEqual(result["result_source"], "exact_reference_match")
        self.assertEqual(result["matched_reference_id"], reference["id"])
        self.assertEqual(result["context"], reference["label"])
        self.assertIn("CatMeows", result["reference_provenance"])

    def test_fingerprint_requires_exact_canonical_pcm(self):
        original = [0.1, -0.2, 0.3] * 2000
        changed = original.copy()
        changed[100] += 1 / 32768
        self.assertNotEqual(
            canonical_audio_fingerprint(original, 8000),
            canonical_audio_fingerprint(changed, 8000),
        )

    def test_valid_cat_audio_with_database_plus_ai_prefers_database(self):
        features = self._reference_for(database_match=True)
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("likely_meow", "supported")), patch("backend.audio_model.extract_features", return_value=features):
            result = self.model.analyze([0.1] * 16000, 8000, "database_plus_ai")
        self.assertEqual(result["result_source"], "database_match")
        self.assertFalse(result["fallback_used"])

    def test_database_failure_triggers_acoustic_fallback(self):
        features = self._reference_for(database_match=False, acoustic_match=True)
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("likely_meow", "supported")), patch("backend.audio_model.extract_features", return_value=features):
            result = self.model.analyze([0.1] * 16000, 8000, "database_plus_ai")
        self.assertEqual(result["detection"], "likely_meow")
        self.assertEqual(result["result_source"], "acoustic_classifier")
        self.assertTrue(result["fallback_used"])
        self.assertNotEqual(result["suggested_context"], "Unknown")

    def _fallback_result(self, label: str, margin: float) -> dict:
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("likely_meow", "supported")), patch("backend.audio_model.extract_features", return_value=[0.0] * self.model.data["feature_count"]), patch.object(self.model, "_database_match", return_value=None), patch.object(self.model, "_acoustic_scores", return_value=(label, margin)):
            return self.model.analyze([0.123] * 16000, 8000, "database_plus_ai")

    def test_brushing_fallback_uses_margin_four(self):
        accepted = self._fallback_result("B", 4.0)
        rejected = self._fallback_result("B", 3.999)
        self.assertEqual(accepted["result_source"], "acoustic_classifier")
        self.assertEqual(accepted["context"], "B")
        self.assertEqual(rejected["suggested_context"], "Unknown")

    def test_food_fallback_always_abstains(self):
        result = self._fallback_result("F", 100.0)
        self.assertEqual(result["result_source"], "none")
        self.assertEqual(result["suggested_context"], "Unknown")
        self.assertTrue(result["fallback_used"])

    def test_isolation_fallback_accepts_without_margin_gate(self):
        result = self._fallback_result("I", 0.0)
        self.assertEqual(result["result_source"], "acoustic_classifier")
        self.assertEqual(result["context"], "I")

    def test_database_only_returns_unknown_without_reliable_match(self):
        features = self._reference_for(database_match=False)
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("likely_meow", "supported")), patch("backend.audio_model.extract_features", return_value=features):
            result = self.model.analyze([0.1] * 16000, 8000, "database_match")
        self.assertEqual(result["result_source"], "none")
        self.assertEqual(result["suggested_context"], "Unknown")
        self.assertFalse(result["fallback_used"])

    def test_non_cat_noise_returns_unknown(self):
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("not_detected", "not cat")), patch("backend.audio_model.extract_features", side_effect=AssertionError("context features must not run")):
            result = self.model.analyze([0.2] * 16000, 8000, "database_plus_ai")
        self.assertEqual(result["detection"], "not_detected")
        self.assertEqual(result["suggested_context"], "Unknown")
        self.assertEqual(result["result_source"], "none")
        self.assertFalse(result["fallback_used"])

    def test_uncertain_detection_returns_unknown(self):
        tone = [0.25 * math.sin(2 * math.pi * 440 * index / 8000) for index in range(16000)]
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("uncertain", "uncertain")), patch("backend.audio_model.extract_features", side_effect=AssertionError("context features must not run")):
            result = self.model.analyze(tone, 8000, "database_plus_ai")
        self.assertEqual(result["detection"], "uncertain")
        self.assertEqual(result["suggested_context"], "Unknown")
        self.assertFalse(result["fallback_used"])

    def test_silence_stops_before_context_analysis(self):
        with patch.object(self.model.detector, "detect", return_value=DetectionResult("not_detected", "silent")), patch("backend.audio_model.extract_features", side_effect=AssertionError("context features must not run")), patch.object(self.model, "_database_match", side_effect=AssertionError("context routing must not run")):
            result = self.model.analyze([0.0] * 16000, 8000, "database_plus_ai")
        self.assertEqual(result["detection"], "not_detected")
        self.assertEqual(result["suggested_context"], "Unknown")

    def test_feature_contract_and_model_evidence(self):
        features = extract_features([0.1] * 16000, 8000)
        self.assertEqual(len(features), self.model.data["feature_count"])
        self.assertEqual(self.model.data["version"], "catmeows-retrieval-gnb-2.2.0")
        self.assertEqual(len(self.model.data["retrieval"]["references"]), 440)
        self.assertIn("confusion", self.model.data["evaluation"])


if __name__ == "__main__":
    unittest.main()
