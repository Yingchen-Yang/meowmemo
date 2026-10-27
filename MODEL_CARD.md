# MeowMemo acoustic baseline model card

## Summary

MeowMemo uses `yamnet-tflite-1+catmeows-retrieval-gnb-2.0.0`: a pretrained general-audio detector followed by the existing narrow context pipeline. It has three deliberately separate decisions:

1. Google's YAMNet AudioSet model says `likely_meow`, `uncertain`, or `not_detected` from calibrated `Cat` event scores and a conservative `Dog` veto.
2. A five-neighbor retrieval path may return a recording condition only when the nearest example is very close and at least four of five labels agree.
3. In Database + AI mode only, a three-class Gaussian naive Bayes model is attempted when retrieval abstains, and returns a context only when its score margin clears a separate threshold.

The model does not infer words, emotions, health, needs, pain, or intent.

The product may display a separate “Cat's POV” line after a supported context is available. That line comes from a versioned, deterministic library of playful phrases. It is not model output, is labeled “Just for fun,” is omitted for Unknown/non-cat results, and follows the owner's corrected context when one is supplied. The original model suggestion remains stored separately.

## Inputs and features

- Mono PCM resampled to 8 kHz, limited to 2–15 seconds by the product
- Duration, RMS, peak/crest, zero-crossing rate
- Short-time envelope quartiles and active-sound ratio
- Autocorrelation pitch and pitch salience
- Eleven normalized Goertzel spectral bands from 125–3400 Hz

Feature extraction is deterministic and implemented in `backend/audio_model.py`.

## Training data

CatMeows 1.0.2 contains 440 cut meows from 21 Maine Coon and European Shorthair cats in three elicited recording contexts:

- `B`: brushing
- `F`: waiting for food
- `I`: isolation in an unfamiliar room

The raw clips are not shipped in this repository. Dataset authors: Luca Andrea Ludovico, Stavros Ntalampiras, Giorgio Presti, Simona Cannas, Monica Battini, and Silvana Mattiello. Source: Zenodo DOI `10.5281/zenodo.4008297`. The record describes open access for scientific research and non-commercial purposes and requires attribution; confirm current record rights before another use.

## Evaluation

All clips from each test cat are held out together. No random clip split is used.

| Metric | Result |
|---|---:|
| Retrieval coverage, leave-one-cat-out | 0.23% (1/440) |
| Retrieval accuracy among shown matches | 100% (1/1; sample too small for a reliability claim) |
| Leave-one-cat-out macro-F1, forced three-class prediction | 0.381 |
| Context coverage after margin-6 abstention | 7.95% (35/440) |
| Accuracy among context suggestions after that threshold | 65.71% (23/35) |

Confusion matrix for forced prediction (rows actual, columns predicted):

| Actual | Brushing | Food waiting | Isolation |
|---|---:|---:|---:|
| Brushing | 26 | 68 | 33 |
| Food waiting | 15 | 58 | 19 |
| Isolation | 30 | 97 | 94 |

These weak results are the primary product limitation. Retrieval's single accepted held-out sample is not sufficient evidence of general reliability; it demonstrates how conservative the gate is. Both paths therefore justify frequent abstention and owner-supplied context. Neither threshold is a calibrated probability, and the UI does not display a fabricated confidence or similarity percentage.

## Cat-vocalization screen

The first stage is Google's 521-class YAMNet AudioSet model in LiteRT format. It consumes mono 16 kHz waveform audio and supplies real per-frame `Cat` and `Dog` event scores. MeowMemo uses task-calibrated cutoffs, never presents these scores as probabilities, and does not run context retrieval or classification unless the gate returns `likely_meow`.

On a 343-clip holdout that reproduces the browser's 8 kHz transport path, the YAMNet gate achieved 85.55% detected recall, 99.56% detected precision, a 1.25% false-positive rate, and 97.50% not-detected specificity. See [YAMNET_EVALUATION.md](./YAMNET_EVALUATION.md) for the protocol, group results, thresholds, and limitations.

## Intended use

- Non-commercial local pilot and journaling research
- Helping an owner organize audio and observations
- Demonstrating transparent abstention and correction workflows

## Out of scope

- Literal translation
- Emotion, intent, welfare, health, or medical diagnosis
- Always-on listening
- Decisions about animal care without a qualified professional
- Claims of automatic personalized learning

## Reproducibility

The complete standard-library trainer is `backend/train_model.py`. It validates that exactly 440 WAV files are present, derives cat identity from filenames, evaluates leave-one-cat-out, then writes parameters and metrics to `backend/model.json`.
