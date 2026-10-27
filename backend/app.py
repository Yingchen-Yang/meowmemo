from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Literal

from pydantic import BaseModel, Field

try:
    from .audio_model import MeowModel, YAMNET_VERSION
except ImportError:
    from audio_model import MeowModel, YAMNET_VERSION

local_origins = ["http://localhost:3000", "http://127.0.0.1:3000"]
allowed_origins = [origin.strip().rstrip("/") for origin in os.getenv("ALLOWED_ORIGINS", "").split(",") if origin.strip()] or local_origins

app = FastAPI(title="MeowMemo Acoustic API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX") or None,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)
model = MeowModel()


class AudioPayload(BaseModel):
    samples: list[float] = Field(min_length=1, max_length=1_500_000)
    sample_rate: int = Field(ge=4000, le=96000)
    analysis_mode: Literal["database_match", "database_plus_ai"] = "database_plus_ai"


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "model_version": f"{YAMNET_VERSION}+{model.data['version']}",
        "detection_model_version": YAMNET_VERSION,
    }


@app.post("/analyze")
def analyze(payload: AudioPayload) -> dict:
    duration = len(payload.samples) / payload.sample_rate
    if duration < 0.5:
        raise HTTPException(422, "Clip is too short. Please provide at least 0.5 seconds.")
    if duration > 15.5:
        raise HTTPException(422, "Clip is longer than the 15 second limit.")
    try:
        return model.analyze(payload.samples, payload.sample_rate, payload.analysis_mode)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
