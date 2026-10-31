# SentinelIoT build plan

## Milestone 1 — Arduino and API
1. Upload `arduino/sentinel.ino`.
2. Confirm serial command A turns the onboard LED on and N turns it off.
3. Install backend requirements and run `uvicorn backend.main:app --reload`.
4. Test `/health` and `/demo/analyze` at `/docs`.

## Milestone 2 — Local traffic demo
1. Install `network/requirements.txt`.
2. Run `python network/local_server.py`.
3. Run each bounded scenario from another terminal.
4. Confirm traffic remains on 127.0.0.1.

## Milestone 3 — Verified ML inference
1. Inspect candidate pretrained artifact and license.
2. Confirm model feature schema and preprocessing.
3. Validate with a sample from the same dataset.
4. Add model adapter only after successful verification.

## Milestone 4 — Real flow monitoring
1. Capture only authorized traffic.
2. Aggregate packets into flows.
3. Reproduce the exact dataset feature extractor.
4. Validate flow features before inference.

## Milestone 5 — Cloud and UI
1. Persist alerts in a database.
2. Build React dashboard.
3. Add device state, event history, charts, and model metadata.

## Safety
Local request bursts and 404/large-body scenarios are anomaly demos, not real DDoS, Mirai, or SYN-flood attacks. Do not test networks without authorization.
