"""SentinelIoT API with hosted pretrained CIC-IoT inference and Arduino alerts."""
from __future__ import annotations
import os, threading
from collections import deque
from datetime import datetime, timezone
from typing import Literal
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
try:
    import serial
except ImportError:
    serial = None

MODEL_API = os.getenv("SENTINEL_MODEL_API", "https://tbommawa-iot-ids-api.hf.space").rstrip("/")
TIMEOUT = float(os.getenv("MODEL_API_TIMEOUT", "25"))
app = FastAPI(title="SentinelIoT API", version="0.2.0")
allowed_origins = [origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
allowed_origins += ["http://127.0.0.1:5173", "http://localhost:5173"]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"])
events: deque[dict] = deque(maxlen=500)
serial_lock = threading.Lock()
arduino = None

class MLRequest(BaseModel):
    features: dict[str, float]
    model: Literal["lightgbm","randomforest"] = "lightgbm"
    explain: bool = True

class LabRequest(BaseModel):
    scenario: Literal["normal", "burst", "failed_requests", "large_payload"]
    model: Literal["lightgbm", "randomforest"] = "lightgbm"

@app.on_event("startup")
def startup():
    global arduino
    port = os.getenv("ARDUINO_PORT")
    if port and serial:
        try:
            arduino = serial.Serial(port, 9600, timeout=1, write_timeout=1)
        except Exception as exc:
            print(f"Arduino unavailable; software-only mode: {exc}")

def notify_arduino(status: str):
    if arduino is not None:
        with serial_lock:
            arduino.write(b"A" if status == "suspicious" else b"N")

def upstream(method: str, path: str, **kwargs):
    try:
        response = requests.request(method, MODEL_API + path, timeout=TIMEOUT, **kwargs)
        response.raise_for_status()
        return response.json()
    except requests.HTTPError as exc:
        detail = exc.response.text[:1000] if exc.response is not None else str(exc)
        raise HTTPException(502, f"Pretrained model API error: {detail}") from exc
    except (requests.RequestException, ValueError) as exc:
        raise HTTPException(502, f"Pretrained model API unavailable or returned invalid JSON: {exc}") from exc

def save_prediction(result: dict, source: str):
    prediction = str(result.get("prediction", "Unknown"))
    suspicious = prediction.strip().lower() not in {"benign", "normal", "0", "false"}
    event = {"timestamp": datetime.now(timezone.utc).isoformat(), "source": source,
             "scenario": "pretrained-ml-inference", "status": "suspicious" if suspicious else "normal",
             "attack_type": prediction, "confidence": result.get("confidence"),
             "latency_ms": result.get("latency_ms"), "detector": "pretrained-ciciot2023",
             "model": result.get("model", "lightgbm"), "feature_count": result.get("feature_count")}
    events.appendleft(event)
    try:
        notify_arduino("suspicious" if suspicious else "normal")
    except Exception as exc:
        event["arduino_error"] = str(exc)
    return event

@app.get("/health")
def health():
    return {"status":"ok","service":"SentinelIoT","detector":"hosted-pretrained-ml",
            "arduino_connected":arduino is not None,"ml_model_configured":True,"ml_model_provider":MODEL_API}

@app.get("/ml/health")
def ml_health():
    return upstream("GET", "/health")

@app.get("/ml/demo/{sample_idx}")
def ml_demo(sample_idx: int, model: Literal["lightgbm","randomforest"] = "lightgbm"):
    if sample_idx < 0 or sample_idx > 9:
        raise HTTPException(400, "sample_idx must be between 0 and 9")
    result = upstream("GET", "/demo/ciciot2023", params={"sample_idx":sample_idx,"model":model})
    event = save_prediction(result, "pretrained-ciciot2023-demo")
    return {"inference":result,"sentinel_event":event}

@app.post("/ml/predict")
def ml_predict(req: MLRequest):
    if not req.features:
        raise HTTPException(400, "Provide CIC-IoT-2023 flow features")
    payload = {"dataset":"ciciot2023","model":req.model,"features":req.features,
               "explain":req.explain,"xai_method":"lime","confidence_threshold":0.85}
    result = upstream("POST", "/predict", json=payload)
    event = save_prediction(result, "ciciot2023-feature-input")
    return {"inference":result,"sentinel_event":event}

def build_lab_features(scenario: str) -> dict[str, float]:
    """Build a documented 20-field synthetic flow profile from a bounded lab scenario.

    These are HTTP-scenario-derived approximations, not packet-captured CIC-IoT flows.
    TCP flags and LLC values unavailable at the HTTP layer are conservatively zeroed.
    """
    profiles = {
        "normal": {"sizes": [220, 260, 240, 280, 230, 250, 270, 240, 260, 230, 250, 280, 240, 260, 250], "gaps": [0.8, 1.0, 0.9, 1.1, 0.8, 1.0, 0.9, 1.1, 0.8, 1.0, 0.9, 1.1, 0.8, 1.0]},
        "burst": {"sizes": [240] * 25, "gaps": [0.1] * 24},
        "failed_requests": {"sizes": [180] * 10, "gaps": [0.25] * 9},
        "large_payload": {"sizes": [4350], "gaps": []},
    }
    p = profiles[scenario]
    sizes, gaps = p["sizes"], p["gaps"]
    total = float(sum(sizes))
    duration = float(sum(gaps)) if gaps else 0.001
    avg = total / len(sizes)
    variance = sum((x - avg) ** 2 for x in sizes) / len(sizes)
    std = variance ** 0.5
    iat = (duration / len(gaps) * 1_000_000) if gaps else 0.0
    return {
        "Number": float(len(sizes)), "Weight": total / max(duration, 0.001),
        "Duration": duration, "IAT": iat, "urg_count": 0.0,
        "rst_count": 0.0, "Magnitue": (avg ** 2 + std ** 2) ** 0.5,
        "Variance": variance, "Tot size": total, "Max": float(max(sizes)),
        "AVG": avg, "Min": float(min(sizes)), "IPv": 4.0, "LLC": 0.0,
        "flow_duration": duration * 1_000_000, "Tot sum": total,
        "Protocol Type": 6.0, "Radius": std, "Std": std, "TCP": 1.0,
    }

@app.post("/lab/run")
def run_lab(req: LabRequest):
    features = build_lab_features(req.scenario)
    payload = {"dataset": "ciciot2023", "model": req.model, "features": features,
               "explain": False, "xai_method": "lime", "confidence_threshold": 0.85}
    result = upstream("POST", "/predict", json=payload)
    event = save_prediction(result, "attack-lab-synthetic-http-flow")
    event["scenario"] = req.scenario
    event["feature_source"] = "synthetic-http-derived"
    return {"scenario": req.scenario, "features": features,
            "feature_note": "Synthetic HTTP-derived approximations; not packet-captured CIC-IoT-2023 features.",
            "inference": result, "sentinel_event": event}

@app.get("/alerts")
def get_alerts():
    return list(events)

@app.get("/stats")
def stats():
    data=list(events)
    return {"events":len(data),"normal":sum(x["status"]=="normal" for x in data),
            "suspicious":sum(x["status"]=="suspicious" for x in data)}

@app.on_event("shutdown")
def shutdown():
    if arduino is not None:
        arduino.close()
