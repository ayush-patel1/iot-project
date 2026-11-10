# SentinelIoT
### IoT Network Intrusion Detection Dashboard

SentinelIoT is an educational IoT security prototype with a React dashboard, FastAPI backend, hosted CIC-IoT-2023 LightGBM inference, optional Wi-Fi packet capture, and optional Arduino LED feedback.

## Quick start (Windows)

**Requirements:** Python 3.10+ and Node.js LTS.

1. Download or clone this repository.
2. Double-click **`start_sentineliot.bat`**.
3. Wait for the dashboard to open at http://127.0.0.1:5173.
4. Open **Overview** or **Traffic Monitor** and run a labelled sample to test ML inference.

The first launch creates a Python virtual environment and installs dependencies. Two terminal windows stay open while the backend and dashboard run. Close them to stop SentinelIoT.

## Is a real ML model used?

Yes, the inference endpoint calls a **hosted pretrained CIC-IoT-2023 LightGBM model** (or Random Forest when selected). The trained model and fitted scaler are hosted by the external model provider; they are **not stored in this repository**. The backend sends requests to `SENTINEL_MODEL_API` (default: `https://tbommawa-iot-ids-api.hf.space`). If that service is unavailable or its preprocessing is incorrect, model results cannot be trusted. The dashboard must show the provider status and raw model output rather than inventing a classification.

The built-in sample buttons use the provider's preloaded benchmark fixtures. Their expected labels are known (samples 0–4 benign, 5–9 attack); expected labels are for comparison only and must not be substituted for model predictions.

## Optional hardware and network features

- **Arduino Uno:** Upload `arduino/sentinel.ino`, then run `py network/device_agent.py --port COM5` (replace COM5 with your board's port). Close Arduino Serial Monitor first. This bridge is optional; it sends board telemetry and relays supported alerts.
- **Live Wi-Fi capture:** Requires Npcap, Scapy, and Administrator permissions. Run `py network/live_capture.py --interface Wi-Fi`. This captures traffic visible to the laptop only. Its CIC-IoT feature mapping is experimental and **not validated for real intrusion classification**. Do not treat its predictions as confirmed attacks.
- **Attack Lab:** Sends synthetic HTTP-derived feature estimates to the hosted model. These are not genuine packet captures or validated CIC-IoT-2023 flow features.

## Architecture

```
Browser dashboard -> FastAPI backend -> Hosted CIC-IoT-2023 model API
                                      -> in-memory detection history
Optional Arduino <- local USB bridge <- backend alert history
Optional Wi-Fi capture agent --------> backend /ml/predict
```

## Configuration

Set `SENTINEL_MODEL_API` to a compatible hosted inference API before starting the backend if you use a different provider. The dashboard's local API defaults to `http://127.0.0.1:8000`.

## Repository layout

- `frontend/` — React dashboard
- `backend/` — FastAPI backend and model API client
- `ml/` — model integration notes
- `network/` — optional Wi-Fi capture and Arduino bridge scripts
- `arduino/` — Arduino Uno firmware
- `start_sentineliot.bat` — one-click Windows launcher

## Important limitations

This is an educational prototype, not a production IDS. The ML model is remotely hosted, demo fixtures are not live traffic, Attack Lab inputs are synthetic, and the current Wi-Fi feature adapter does not reproduce the provider's original CIC-IoT-2023 feature extraction pipeline. Validate the provider preprocessing and live feature extraction against labelled data before claiming real-world detection accuracy or using alerts operationally.

Only monitor networks and devices you own or are authorized to test.
