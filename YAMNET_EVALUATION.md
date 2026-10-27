# YAMNet detector evaluation

## Decision

MeowMemo now uses Google's pretrained YAMNet LiteRT model as the first-stage cat-vocalization gate. The prior detector remains documented below as the comparison baseline but is no longer used in production.

The replacement is evidence-based: on a separate 343-clip evaluation split, YAMNet improved detected recall from 74.14% to 85.55%, improved detected precision from 91.98% to 99.56%, reduced the false-positive rate from 21.25% to 1.25%, and increased not-detected specificity from 15.00% to 97.50%.

## What the previous detector was

The original gate was genuine acoustic inference, but not a general pretrained model. It used a one-class CatMeows feature manifold plus hand-authored silence, zero-crossing, pitch-salience, and distance rules. Because CatMeows contains positives only, that gate had no learned boundary for dog sounds or human speech.

## Data and protocol

The comparison used 700 total examples with deterministic, disjoint calibration and evaluation halves:

- 440 CatMeows clips
- 40 independent ESC-50 cat clips
- 40 ESC-50 dog clips
- 80 spoken-command clips from TensorFlow's `mini_speech_commands`
- 40 ESC-50 environmental clips spanning rain, wind, vacuum, washing machine, clock, typing, siren, and helicopter
- 20 generated silent clips
- 40 ESC-50 cat clips mixed with real environmental audio at 0 dB signal-to-noise ratio

The benchmark reproduces the product path by first applying the browser's 8 kHz downsampling, then passing those samples through FastAPI's 16 kHz YAMNet preprocessing. Thresholds were chosen only on the calibration half. Metrics below are from the untouched evaluation half (343 clips: 263 cat-positive, 80 negative).

| Metric | Previous gate | YAMNet gate |
|---|---:|---:|
| Detected recall | 74.14% | 85.55% |
| Detected precision | 91.98% | 99.56% |
| False-positive rate | 21.25% | 1.25% |
| Not-detected specificity | 15.00% | 97.50% |
| False-negative rate | 11.79% | 11.03% |
| Uncertain rate | 25.66% | 2.92% |

Evaluation outcomes for the final YAMNet gate:

| Group | Detected | Uncertain | Not detected |
|---|---:|---:|---:|
| CatMeows | 191 | 7 | 27 |
| Independent ESC-50 cats | 21 | 0 | 1 |
| Cats mixed with noise | 13 | 2 | 1 |
| Dogs | 0 | 0 | 18 |
| Human speech | 0 | 1 | 37 |
| Environmental noise | 1 | 0 | 15 |
| Silence | 0 | 0 | 8 |

## Calibration

YAMNet scores are not treated as probabilities. The production rules use the maximum AudioSet `Cat` score across frames:

- below `0.010839`: not detected
- `0.010839` through `0.026744`: uncertain
- `0.026745` or above: detected
- strong dog veto: not detected when the maximum `Dog` score is at least `0.5` and at least five times the maximum `Cat` score

The low threshold was selected to keep calibration false negatives below 9.5% while requiring at least 95% negative specificity. The high threshold required at least 90% precision and no more than 5% false positives on calibration. These values are task-specific score cutoffs, not calibrated probabilities.

## Runtime and deployment

- Bundled model: Google's official YAMNet LiteRT version 1, 15.4 MB
- Runtime: `ai-edge-litert` with XNNPACK, CPU-only; no API key or network inference
- Resampling: `soxr` high-quality mono conversion to YAMNet's required 16 kHz
- Measured YAMNet inference: 5.6 ms median, 15.5 ms p95 on the benchmark machine, excluding JSON transport
- Thread safety: a lock protects the shared LiteRT interpreter
- License: YAMNet model/code is Apache-2.0

## Reproduce

`backend/evaluate_yamnet.py` runs the comparison. TensorFlow/TensorFlow Hub are optional only when evaluating the Hub model; production uses LiteRT. Example for the bundled model:

```bash
PYTHONPATH=. python backend/evaluate_yamnet.py \
  --cat-dir /path/to/CatMeows/dataset \
  --esc-root /path/to/ESC-50-master \
  --speech-root /path/to/mini_speech_commands \
  --tflite backend/yamnet.tflite \
  --class-map backend/yamnet_class_map.csv \
  --simulate-frontend \
  --output /tmp/yamnet-evaluation.json
```

## Limitations

- The holdout is modest and composed from public datasets, not in-home MeowMemo recordings.
- CatMeows contributes many positive clips and also trains the downstream context model; independent ESC-50 cat results are therefore reported separately.
- One environmental holdout clip was a false positive, and one independent cat was missed.
- Mixed-noise examples use synthetic 0 dB mixing and do not cover all rooms, devices, distances, or overlapping voices.
- Thresholds should be revisited with consented, device-diverse pilot audio before making broader reliability claims.
