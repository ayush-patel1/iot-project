"""SentinelIoT API starter with demo rules and optional Arduino serial alerts."""
from __future__ import annotations
import os
import threading
from collections import deque
from datetime import datetime, timezone
from typing import Literal
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    import serial
except ImportError:
    serial = None

app = FastAPI(title="SentinelIoT API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)
events: deque[dict] = deque(maxlen=500)
serial_lock = threading.Lock()
arduino = None

class DemoRequest(BaseModel):
    source: str = Field(default="local-demo", max_length=100)
    scenario: Literal["normal", "burst", "failed_requests", "large_payload"]
    packet_count: int = Field(default=1, ge=1, le=1_000_000)
    byte_count: int = Field(default=0, ge=0, le=1_000_000_000)
    duration_seconds: float = Field(default=1.0, gt=0, le=86400)

@app.on_event("startup")
def startup():
    global arduino
    port = os.getenv("ARDUINO_PORT")
    if port and serial:
        try:
            arduino = serial.Serial(port, 9600, timeout=1, write_timeout=1)
        except Exception as exc:
            print(f"Arduino unavailable; continuing software-only: {exc}")

def notify_arduino(status: str):
    if arduino is not None:
        with serial_lock:
            arduino.write(b"A" if status == "suspicious" else b"N")

@app.get("/health")
def health():
    return {"status":"ok","service":"SentinelIoT","detector":"demo-rules",
            "arduino_connected":arduino is not None,"ml_model_loaded":False}

@app.post("/demo/analyze")
def analyze(req: DemoRequest):
    """Rule-based demo only; this endpoint does not claim ML classification."""
    rate=req.packet_count/req.duration_seconds
    suspicious=req.scenario != "normal" or rate > 10
    status="suspicious" if suspicious else "normal"
    event={"timestamp":datetime.now(timezone.utc).isoformat(),"source":req.source,
           "scenario":req.scenario,"packet_count":req.packet_count,
           "byte_count":req.byte_count,"packet_rate":round(rate,2),
           "status":status,"detector":"demo-rule",
           "attack_type":"anomaly-demo" if suspicious else "BENIGN"}
    events.appendleft(event)
    try:
        notify_arduino(status)
    except Exception as exc:
        raise HTTPException(status_code=503,detail=f"Arduino write failed: {exc}") from exc
    return event

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
