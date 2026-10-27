# Third-party notices

## Runtime packages

The application uses unmodified packages from their normal registries. Consult each package's included license for the controlling terms.

| Package/project | Purpose | License family |
|---|---|---|
| Next.js, React, React DOM | Web application runtime | MIT |
| Tailwind CSS | CSS build tooling | MIT |
| Radix UI Dialog/Label/Select | Accessible UI primitives | MIT |
| Lucide React | Icons | ISC |
| FastAPI, Starlette, Uvicorn | Python HTTP service | MIT / BSD-3-Clause |
| Pydantic | Request validation | MIT |
| Google YAMNet model, class map, and TensorFlow model code | Pretrained audio-event detection | Apache-2.0 |
| LiteRT (`ai-edge-litert`) | Local YAMNet inference | Apache-2.0 |
| NumPy / soxr | Waveform processing and resampling | BSD-3-Clause / LGPL-2.1-or-later |

Exact versions are locked in `package-lock.json` and pinned in `backend/requirements.txt`.

## Training data

CatMeows 1.0.2 was used locally to derive the compact statistical parameters in `backend/model.json`. Raw recordings are not redistributed. The Zenodo record states scientific-research/non-commercial use and attribution requirements. Verify the record's current license and your use case before retraining or commercial deployment.

Ludovico, L. A., Ntalampiras, S., Presti, G., Cannas, S., Battini, M., & Mattiello, S. (2020). *CatMeows: A Publicly-Available Dataset of Cat Vocalizations*. Zenodo. https://doi.org/10.5281/zenodo.4008297

ESC-50 and TensorFlow `mini_speech_commands` were used only for the offline YAMNet evaluation described in `YAMNET_EVALUATION.md`; neither dataset is bundled. FSD50K was reviewed as a possible future source but is not bundled or used by the runtime.

## Bundled YAMNet assets

`backend/yamnet.tflite` is Google's official YAMNet LiteRT version 1 downloaded from the Google-published Kaggle Models entry. `backend/yamnet_class_map.csv` comes from TensorFlow Model Garden. Both are Apache-2.0 assets.

- Model SHA-256: `141fba1cdaae842c816f28edc4937e8b4f0af4c8df21862ccc6b52dc567993c3`
- Class map SHA-256: `cdf24d193e196d9e95912a2667051ae203e92a2ba09449218ccb40ef787c6df2`
- Source: https://www.kaggle.com/models/google/yamnet/tfLite/tflite/1
- Source code/license: https://github.com/tensorflow/models/tree/master/research/audioset/yamnet
