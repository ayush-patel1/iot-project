# SentinelIoT
### IoT Network Intrusion Detection Dashboard

SentinelIoT is an educational IoT security prototype with a React dashboard, FastAPI backend, hosted CIC-IoT-2023 LightGBM inference, optional Wi-Fi packet capture, and optional Arduino LED feedback.

## Quick start (Windows + Arduino Uno)

**Requirements:** Python 3.10+, Node.js LTS, Arduino Uno, and a USB data cable.

### One-time board setup
1. Open arduino/sentinel.ino in Arduino IDE.
2. Select Arduino Uno and its COM port.
3. Upload the firmware once. It reports device ID, uptime, and LED state, and accepts A (LED on) / N (LED off).

### Every run
1. Connect the Uno to the laptop by USB. Close Arduino IDE Serial Monitor.
2. Double-click start_sentineliot.bat.
3. The launcher starts the backend, dashboard, and Arduino bridge; the bridge auto-detects the serial port.
4. The dashboard opens at http://127.0.0.1:5173. Check the Device endpoint page for telemetry.
5. Use Overview / Traffic Monitor to run the hosted model's benchmark inference.

The first launch creates a Python virtual environment and installs dependencies. Keep the backend, dashboard, and Arduino terminal windows open. If multiple serial devices are attached, run network/device_agent.py with --port COMx using the Arduino's port.
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
