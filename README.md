# SentinelIoT
### ML-Based IoT Network Intrusion Detection and Cloud Monitoring

SentinelIoT is a low-cost IoT security prototype. A laptop performs network-flow monitoring and ML inference; an Arduino Uno acts as a USB-connected physical alert endpoint.

## Architecture
```
Test traffic / labeled CICIoT2023 flows
          -> Flow extraction
          -> Feature-schema adapter
          -> IDS inference
          -> FastAPI
          -> Alert store + USB Serial
          -> React dashboard + Arduino Uno
```

The Uno does **not** sniff Wi-Fi, capture packets, or run the ML model. The laptop performs those tasks.

## Repository layout
- `arduino/`: Uno firmware
- `backend/`: FastAPI service and serial alert bridge
- `network/`: local HTTP traffic generator
- `ml/`: model adapter and schema documentation
- `docs/`: setup and safety notes

## Quick start (Windows)
1. Upload `arduino/sentinel.ino` using Arduino IDE. Select Arduino Uno and 9600 baud.
2. Create a Python environment:
   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r backend/requirements.txt
   pip install -r network/requirements.txt
   ```
3. Start the API: `uvicorn backend.main:app --reload`
4. Open http://127.0.0.1:8000/docs

Serial hardware is disabled by default. Set `ARDUINO_PORT=COM3` (replace with your port) to enable the USB bridge. Close Arduino Serial Monitor before starting the API.

## Local traffic demo
Run in separate terminals:
```powershell
python network/local_server.py
python network/traffic_generator.py --scenario normal
python network/traffic_generator.py --scenario burst
python network/traffic_generator.py --scenario failed_requests
python network/traffic_generator.py --scenario large_payload
``
These are local anomaly demonstrations, not genuine DDoS, Mirai, or SYN-flood reproductions.

## ML model status
No pretrained model is bundled here yet. A candidate model repository is documented in `ml/README.md`. Verify artifact availability, license, feature order, preprocessing, and package versions before loading any external pickle/joblib file.

CICIoT2023 models expect specific flow-level features. Raw packets or arbitrary HTTP requests cannot be passed directly to the classifier.

## Safety
Only monitor networks and devices you own or are explicitly authorized to test. Use loopback traffic and public labeled datasets for demonstrations.

## Current milestone
- [x] Initial project scaffold
- [x] Arduino USB alert firmware
- [x] Local traffic demo
- [x] FastAPI starter service
- [ ] Verify a compatible pretrained IDS artifact
- [ ] Implement dataset-compatible flow feature extraction
- [ ] Connect predictions to Arduino alerts
- [ ] Add cloud persistence and React dashboard
