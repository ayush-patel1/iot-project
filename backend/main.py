"""SentinelIoT API with hosted pretrained CIC-IoT inference and Arduino alerts."""
from __future__ import annotations
import os, random, threading
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
allowed_origins += ["https://sentineliot.netlify.app", "http://127.0.0.1:5173", "http://localhost:5173"]
app.add_middleware(CORSMiddleware, allow_origins=allowed_origins, allow_credentials=False, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["Content-Type"])
events: deque[dict] = deque(maxlen=500)
hardware_commands: deque[dict] = deque(maxlen=200)
next_hardware_command_id = 1
latest_device_telemetry: dict | None = None
serial_lock = threading.Lock()
arduino = None

class MLRequest(BaseModel):
    features: dict[str, float]
    model: Literal["lightgbm","randomforest"] = "lightgbm"
    explain: bool = True
    source: str = "ciciot2023-feature-input"

class LabRequest(BaseModel):
    scenario: Literal["normal", "burst", "failed_requests", "large_payload"]
    model: Literal["lightgbm", "randomforest"] = "lightgbm"

class DeviceTelemetry(BaseModel):
    device_id: str
    uptime_ms: int
    led_state: Literal["on", "off", "green", "red"]
    alarm_state: bool = False
    attack_type: str = "normal"
    firmware: str = "sentinel-uno-v3"

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
            arduino.write(b"A\n" if status == "suspicious" else b"N\n")

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

def normalize_prediction(value: str) -> str:
    label = value.strip().lower()
    if label in {"benign", "normal", "0", "false"} or label.startswith("benign"):
        return "Benign"
    if label == "attack" or "attack" in label:
        return "Attack"
    return "Unclassified"


def save_prediction(result: dict, source: str, expected_prediction: str | None = None):
    prediction = str(result.get("prediction", "Unknown"))
    model_class = normalize_prediction(prediction)

    # Packet-derived live features are not yet validated against the training pipeline.
    # Preserve the model output for diagnostics, but never create an alert or signal Arduino.
    experimental_live = source.startswith("live-wifi-capture")
    synthetic_demo = source == "pretrained-ciciot2023-demo"
    expected_class = normalize_prediction(expected_prediction) if expected_prediction else None
    test_result = ("not-comparable" if not expected_class or model_class == "Unclassified"
                   else "pass" if model_class == expected_class else "mismatch")
    # Demo samples are validation fixtures, not observed network traffic. Keep
    # their model output visible, but never count them as live detections/alerts.
    status = ("unclassified" if experimental_live or synthetic_demo or test_result == "mismatch" else
              "normal" if model_class == "Benign" else
              "suspicious" if model_class == "Attack" else "unclassified")
    event = {"timestamp": datetime.now(timezone.utc).isoformat(), "source": source,
             "scenario": "pretrained-ml-inference", "status": status,
             "attack_type": prediction, "model_prediction": model_class,
             "expected_prediction": expected_class, "test_result": test_result,
             "confidence": result.get("confidence"),
             "latency_ms": result.get("latency_ms"), "detector": "pretrained-ciciot2023",
             "model": result.get("model", "lightgbm"), "feature_count": result.get("feature_count")}
    if experimental_live:
        event["classification_note"] = (
            "Experimental packet-derived features are not validated against the model training pipeline; "
            "prediction is informational only and is not an intrusion alert."
        )
    if synthetic_demo:
        event["classification_note"] = (
            "Provider demo fixture, not observed network traffic. Its source marks the sample values as "
            "already scaled while the demo inference path appears to apply the scaler again; treat this "
            "prediction as diagnostic until the provider corrects that preprocessing path."
        )
    if expected_class and test_result == "mismatch":
        event["classification_note"] = (
            f"Scenario expected {expected_class}, but the model predicted {model_class}. "
            "This is a test mismatch, not a confirmed real-world intrusion."
        )
    events.appendleft(event)
    try:
        # Do not let a failed synthetic test trigger a physical Arduino alarm.
        if not experimental_live and not synthetic_demo and test_result != "mismatch" and status in {"suspicious", "normal"}:
            notify_arduino(status)
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
    expected = "Benign" if sample_idx <= 4 else "Attack"
    event = save_prediction(result, "pretrained-ciciot2023-demo", expected)
    return {"inference":result,"sentinel_event":event}

@app.post("/ml/predict")
def ml_predict(req: MLRequest):
    if not req.features:
        raise HTTPException(400, "Provide CIC-IoT-2023 flow features")
    payload = {"dataset":"ciciot2023","model":req.model,"features":req.features,
               "explain":req.explain,"xai_method":"lime","confidence_threshold":0.85}
    result = upstream("POST", "/predict", json=payload)
    event = save_prediction(result, req.source)
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
    expected = "Benign" if req.scenario == "normal" else "Attack"
    event = save_prediction(result, "attack-lab-synthetic-http-flow", expected)
    event["scenario"] = req.scenario
    event["feature_source"] = "synthetic-http-derived"
    return {"scenario": req.scenario, "features": features,
            "feature_note": "Synthetic HTTP-derived approximations; not packet-captured CIC-IoT-2023 features.",
            "inference": result, "sentinel_event": event}

@app.get("/alerts")
def get_alerts():
    return list(events)

@app.post("/device/telemetry")
def receive_device_telemetry(data: DeviceTelemetry):
    global latest_device_telemetry
    latest_device_telemetry = {**data.model_dump(), "received_at": datetime.now(timezone.utc).isoformat(), "connected": True}
    return {"status": "received", "device": latest_device_telemetry}


class HardwareDemoCommand(BaseModel):
    command: Literal["N", "A", "DOS", "DDOS", "SCAN", "BRUTE", "BOTNET"]

@app.post("/device/demo-command")
def queue_hardware_demo_command(data: HardwareDemoCommand):
    """Queue a labelled LED-only hardware demo command for the local USB bridge."""
    global next_hardware_command_id
    command = {"id": next_hardware_command_id, "command": data.command,
               "state": "normal" if data.command == "N" else "attack",
               "attack_type": "normal" if data.command == "N" else data.command.lower(),
               "source": "dashboard-hardware-demo"}
    next_hardware_command_id += 1
    hardware_commands.append(command)

    # Record the physical endpoint action as a hardware signal, not an ML prediction.
    labels = {"N": "Normal", "A": "Generic attack", "DOS": "DoS", "DDOS": "DDoS",
              "SCAN": "Port scan", "BRUTE": "Brute force", "BOTNET": "Botnet"}
    is_normal = data.command == "N"
    event = {"timestamp": datetime.now(timezone.utc).isoformat(),
             "source": "dashboard-hardware-command", "scenario": "hardware-led-command",
             "status": "normal" if is_normal else "hardware-triggered",
             "model_prediction": None, "attack_type": labels[data.command],
             "display_label": labels[data.command], "command": data.command,
             "confidence": None, "latency_ms": None,
             "demo_confidence": random.randint(70, 95),
             "demo_latency_ms": round(random.uniform(4.0, 18.0), 2),
             "model": "Manual LED control", "event_type": "hardware",
             "metrics_note": "Illustrative demo metrics; not measured model confidence or inference latency."}
    events.appendleft(event)
    print(f"[SentinelIoT] Hardware signal queued: {labels[data.command]} ({data.command})")
    return {"status": "queued", "command": command, "sentinel_event": event}

@app.get("/device/commands")
def get_hardware_commands(after_id: int = 0):
    return [command for command in hardware_commands if command["id"] > after_id]

@app.get("/device/telemetry")
def get_device_telemetry():
    return latest_device_telemetry or {"connected": False, "message": "No Arduino telemetry received yet"}

@app.get("/stats")
def stats():
    data = list(events)
    return {
        "events": len(data),
        "normal": sum(x.get("status") == "normal" for x in data),
        "suspicious": sum(x.get("status") == "suspicious" for x in data),
        "hardware_normal": sum(x.get("event_type") == "hardware" and x.get("status") == "normal" for x in data),
        "hardware_attack": sum(x.get("event_type") == "hardware" and x.get("status") == "hardware-triggered" for x in data),
    }

@app.on_event("shutdown")
def shutdown():
    if arduino is not None:
        arduino.close()
