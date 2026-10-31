# SentinelIoT
### ML-Based IoT Network Intrusion Detection and Cloud Monitoring

SentinelIoT is an educational IoT security prototype. The hosted LightGBM API classifies preloaded CIC-IoT-2023 samples. A local laptop can run bounded localhost traffic scenarios, and an Arduino Uno can act as a USB alert endpoint when connected to a process running on that same laptop.

## Current capabilities
- React dashboard with Overview, Traffic monitor, Attack Lab, Threat alerts and Device endpoint pages.
- Hosted pretrained CIC-IoT-2023 inference through `/ml/demo/{sample_idx}` and `/ml/predict`.
- Bounded local HTTP traffic scenarios against a loopback-only Flask test service.
- Arduino Uno firmware for serial LED alerts.

**Important:** The localhost traffic generator is currently separate from the pretrained ML inference pipeline. Its HTTP requests are not converted into the model's 20 CIC-IoT-2023 features and will not appear as ML detections or trigger Arduino alerts. The Attack Lab makes this distinction visible; do not describe these local patterns as ML-detected attacks.

## Architecture
```
Preloaded CIC-IoT-2023 samples -> Hosted LightGBM API -> FastAPI -> Dashboard / alert history
Local test scenarios -> 127.0.0.1:5001 (Flask) [isolated demo traffic]
Local laptop process -> USB Serial -> Arduino Uno (hardware bridge setup required)
```

The Uno does **not** sniff Wi-Fi, capture packets, or run the ML model. Render cannot access a USB board attached to your laptop.

## Repository layout
- `arduino/`: Uno firmware
- `backend/`: FastAPI service and hosted model integration
- `frontend/`: React dashboard
- `network/`: local-only HTTP test server and traffic generator
- `ml/`: model feature-schema notes

## Quick start (Windows)
1. Upload `arduino/sentinel.ino` using Arduino IDE (Arduino Uno, 9600 baud) if you want the hardware LED demo.
2. Create and activate a Python environment:
   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   pip install -r network/requirements.txt
   ```
3. Start the FastAPI backend:
   ```powershell
   uvicorn backend.main:app --reload
   ```
4. Open the frontend deployed at https://sentineliot.netlify.app/ or run it locally from `frontend/` with `npm install` and `npm run dev`.
5. Use Overview or Traffic monitor to run the hosted ML benchmark samples.

## Attack Lab: local traffic simulation
Open two PowerShell terminals from the repository root.

**Terminal 1 — start the local test service**
```powershell
pip install -r network/requirements.txt
python network/local_server.py
```

**Terminal 2 — run one scenario**
```powershell
python network/traffic_generator.py --scenario normal
python network/traffic_generator.py --scenario burst
python network/traffic_generator.py --scenario failed_requests
python network/traffic_generator.py --scenario large_payload
```

Run one command at a time. Keep Terminal 1 running while testing. Press `Ctrl+C` to stop a running command or the server.

| Scenario | Bounded local behaviour |
|---|---|
| `normal` | 15 spaced requests to local health/device endpoints |
| `burst` | 25 quick requests to the local health endpoint; not a DoS test |
| `failed_requests` | 10 requests to deliberately missing local paths (HTTP 404) |
| `large_payload` | One 4 KB JSON body sent to the local echo endpoint |

All generated requests target `127.0.0.1:5001` only. These are repeatable HTTP demonstrations, not real port scans, brute-force attempts, DDoS, Mirai, or SYN-flood attacks.

## Arduino notes
The firmware accepts `A` (LED on) and `N` (LED off) over USB serial at 9600 baud. A board plugged into your laptop cannot be controlled by the hosted Render backend directly. A local serial bridge still needs to be run on the laptop; do not set the laptop's COM port in Render.

## Model and feature-schema limitation
The hosted model expects the exact named CIC-IoT-2023 flow features documented in `ml/README.md`. Raw packets and arbitrary HTTP requests cannot be sent directly to it. Live capture and a validated flow-feature adapter are not implemented yet.

## Safety
Only test systems you own or are explicitly authorized to test. This Attack Lab is deliberately limited to loopback traffic on your own machine.
