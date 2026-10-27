# MeowMemo

MeowMemo is a private, local-first cat vocalization journal. It records or uploads real audio, draws the waveform from the decoded signal, sends PCM samples to a narrow acoustic model, and saves the clip, model output, owner correction, and note in the browser.

It is **not** a cat-to-human translator. The only learned context labels are the recording conditions in CatMeows: waiting for food, brushing, and isolation in an unfamiliar room. Results are tentative and the model can abstain.

## What works

- Multiple cat profiles with optional photos
- Microphone recording with live input levels, a 15-second limit, preview, retry, and permission errors
- Audio upload with format, size, duration, and decode validation
- Actual decoded-audio waveforms and playback
- FastAPI inference using Google's pretrained YAMNet LiteRT model as the calibrated cat-vocalization gate, followed by the existing labeled-example retrieval and CatMeows acoustic context baseline
- Two Step 3 modes: conservative Database Match, or retrieval-first Database + AI fallback
- Silence, out-of-distribution, and low-context-evidence abstention
- Owner confirmations/corrections and notes
- A deterministic, versioned “Cat’s POV” caption layer that is visibly labeled as playful interpretation and never used for Unknown or non-cat results
- IndexedDB audio persistence and versioned localStorage metadata
- Journal filtering, note editing, playback, and complete local deletion
- Responsive, keyboard-accessible mobile and desktop UI

## Run locally

Requirements: Node.js 20+ and Python 3.11+.

```bash
npm install
cp .env.example .env.local

python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
```

Terminal 1:

```bash
cd backend
.venv/bin/uvicorn app:app --reload --port 8000
```

Terminal 2:

```bash
npm run dev
```

Open `http://localhost:3000`. Microphone capture requires localhost or HTTPS. `NEXT_PUBLIC_API_URL` is public configuration, never a secret.

## Checks

```bash
npm run typecheck
npm run lint
npm run test:captions
npm run build
python3 -m unittest backend/test_audio_model.py backend/test_yamnet_detector.py
```

The production build intentionally uses webpack because some sandboxed environments prevent Turbopack's CSS worker from binding its local process port.

## Retrain the model

The raw dataset is not included. Download CatMeows 1.0.2 from [Zenodo record 4008297](https://zenodo.org/records/4008297), unzip `dataset.zip`, then run:

```bash
python3 backend/train_model.py /absolute/path/to/dataset --output backend/model.json
```

The trainer extracts real time, envelope, pitch-salience, and Goertzel spectral features, builds a 440-example retrieval index, trains Gaussian naive Bayes profiles, and evaluates both paths with leave-one-cat-out splits. See [MODEL_CARD.md](./MODEL_CARD.md).

## Storage and privacy

- Cat metadata and analysis records stay in versioned `localStorage`.
- Audio blobs stay in this origin's IndexedDB.
- New records preserve the original model suggestion, owner-confirmed context, selected caption, caption-library version, and whether the caption follows the inference or an owner correction. Older records remain readable and derive a stable caption from their existing context.
- Nothing is made public and there is no account or analytics layer.
- Delete removes both the metadata record and the stored audio blob.
- Clearing browser site data removes the journal.

This is suitable for a local pilot, not cross-device backup. Do not record by provoking or distressing an animal.

## Deployment

### Frontend (Vercel)

1. Import this directory as a Vercel project.
2. Set `NEXT_PUBLIC_API_URL` as a non-secret Config variable to the HTTPS Render origin, with no trailing slash.
3. Deploy. The Next.js frontend is static and needs no paid service.

### API (Render)

Create a Python web service with root directory `backend`, build command `pip install -r requirements.txt`, and start command `uvicorn app:app --host 0.0.0.0 --port $PORT`. Set `ALLOWED_ORIGINS` to the HTTPS Vercel production origin (comma-separated if more than one exact origin is required). The service is stateless and needs no volume. The included Dockerfile also honors Render's `PORT` variable.

No deployment was performed from this workspace because no hosting credentials or target were provided. A public demo and walkthrough video therefore remain delivery steps, not claimed outputs.

## Project map

- `app/`, `components/`, `lib/`: Next.js client and local persistence
- `backend/app.py`: validated FastAPI contract
- `backend/audio_model.py`: deployed feature extraction and inference
- `backend/yamnet_detector.py`: calibrated YAMNet LiteRT first-stage detector
- `backend/yamnet.tflite`: bundled official Google YAMNet LiteRT model
- `backend/evaluate_yamnet.py`: reproducible legacy-versus-YAMNet benchmark
- `backend/train_model.py`: reproducible trainer and cat-held-out evaluation
- `backend/model.json`: compact learned parameters and evaluation metadata
- `MODEL_CARD.md`: intended use, metrics, limitations, and dataset statement
- `THIRD_PARTY_NOTICES.md`: dependency and data licensing notes

## Known limitations

- Database Match is intentionally extremely conservative: leave-one-cat-out evaluation matched 1 of 440 clips at the configured threshold. The acoustic fallback generalizes poorly across unseen cats (macro-F1 0.381) and shows a context on only about 8% of held-out clips.
- The YAMNet gate materially outperformed the previous one-class detector on the 343-clip holdout, but that public-data benchmark is not a substitute for device-diverse in-home validation. See [YAMNET_EVALUATION.md](./YAMNET_EVALUATION.md).
- Browser audio codec support varies; decoded WAV, MP3, M4A, WebM, and Ogg support depends on the browser.
- Data is device/browser-local and has no sync or backup.
- No automatic personalization or retraining is claimed or implemented.
- “Cat's POV” lines come from a small curated, context-specific phrase library. Selection is deterministic per recording and is not generated by the acoustic model, a language model, or a translation system.

## License

Original application code is MIT licensed. CatMeows data is not redistributed; its terms and required attribution remain with its authors and Zenodo record.
