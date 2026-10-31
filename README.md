# SentinelIoT
### ML-Based IoT Network Intrusion Detection and Cloud Monitoring

SentinelIoT is an educational IoT security prototype. The hosted LightGBM API classifies preloaded CIC-IoT-2023 samples. A local laptop can run bounded localhost traffic scenarios, and an Arduino Uno can act as a USB alert endpoint when connected to a process running on that same laptop.

## Current capabilities
- React dashboard with Overview, Traffic monitor, Attack Lab, Threat alerts and Device endpoint pages.
- Hosted pretrained CIC-IoT-2023 inference through `/ml/demo/{sample_idx}` and `/ml/predict`.
- Cloud Attack Lab scenarios that construct a bounded synthetic 20-field input profile and submit it to the hosted ML API through `/lab/run`.
- Arduino Uno firmware that reports real board ID, uptime and LED state over USB Serial (no external sensors required).
- `network/device_agent.py` uploads Arduino telemetry to the cloud dashboard and relays newly recorded ML alerts to the board.

**Important:** Attack Lab feature values are approximations derived from predefined HTTP scenario profiles. They are not extracted from packet captures and are not validated as genuine CIC-IoT-2023 flow measurements. Treat predictions as an integration demonstration, not a measure of real-world detection performance.

## Architecture
```
Attack Lab scenario -> synthetic 20-field profile -> Hosted LightGBM API -> FastAPI -> Dashboard / alert history
Preloaded CIC-IoT-2023 samples ---------------------------> Hosted LightGBM API
Hosted alert history -> local laptop bridge -> USB Serial -> Arduino Uno
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

## Attack Lab: cloud scenario inference
Open the deployed dashboard, choose **Attack Lab**, and run one of the four bounded scenarios. The frontend calls `POST /lab/run`; FastAPI builds the scenario's synthetic feature profile, sends all 20 named fields to the hosted model API, records the returned prediction, and refreshes dashboard history.

The scenarios are synthetic profiles, not live HTTP requests or packet captures. The feature adapter uses estimated sizes and timing values; HTTP-layer data cannot reveal TCP flags or LLC measurements, so those fields are set to zero. Do not interpret these outputs as validated CIC-IoT-2023 measurements or real-network IDS performance.

## Arduino telemetry and cloud-alert agent
1. Open `arduino/sentinel.ino` in Arduino IDE, select Arduino Uno and the correct port, then upload the firmware.
2. Close Arduino IDE Serial Monitor (only one program can own the serial port).
3. Install the local agent dependencies and run it on the laptop connected to the board:
```powershell
pip install requests pyserial
python network/device_agent.py --port COM3
```
Replace `COM3` with the port shown in Arduino IDE. The firmware sends JSON telemetry containing device ID, uptime and LED state every two seconds. The agent posts it to `/device/telemetry`, which is displayed on the Device endpoint page. The agent also polls `/alerts` and sends `A` for suspicious predictions or `N` for normal predictions.

**No sensor is connected yet:** uptime and LED state are genuine board telemetry, but they are not temperature, humidity, motion or network traffic. This endpoint does not send device telemetry to the intrusion classifier. Network intrusion prediction still requires actual captured network flows and a validated CIC-IoT-2023 feature extractor.

## Arduino notes
The firmware accepts `A` (LED on) and `N` (LED off) over USB serial at 9600 baud. A board plugged into your laptop cannot be controlled by the hosted Render backend directly. A local serial bridge still needs to be run on the laptop; do not set the laptop's COM port in Render.

## Model and feature-schema limitation
The hosted model expects the exact named CIC-IoT-2023 flow features documented in `ml/README.md`. Raw packets and arbitrary HTTP requests cannot be sent directly to it. Live capture and a validated flow-feature adapter are not implemented yet.

## Safety
Only test systems you own or are explicitly authorized to test. This Attack Lab is deliberately limited to loopback traffic on your own machine.
