import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.app import AudioPayload, analyze


class AudioValidationTests(unittest.TestCase):
    def test_half_second_clip_is_accepted(self):
        payload = AudioPayload(samples=[0.0] * 4000, sample_rate=8000)
        with patch("backend.app.model.analyze", return_value={"detection": "not_detected"}) as model_analyze:
            self.assertEqual(analyze(payload)["detection"], "not_detected")
        model_analyze.assert_called_once()

    def test_clip_just_under_half_second_is_rejected(self):
        payload = AudioPayload(samples=[0.0] * 3999, sample_rate=8000)
        with self.assertRaises(HTTPException) as caught:
            analyze(payload)
        self.assertEqual(caught.exception.status_code, 422)


if __name__ == "__main__":
    unittest.main()
