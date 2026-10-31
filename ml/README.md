# ML model integration

No third-party model binary is copied into this repository yet.

CICIoT2023 classifiers expect a fixed flow-level feature schema. Raw Scapy packets and arbitrary HTTP requests are not equivalent to dataset flow rows. Valid inference requires the exact feature names/order, feature engineering, preprocessing, and label mapping used during training.

## Candidate for evaluation
https://github.com/Husseinchr/iot-intrusion-detection

Its public documentation describes a CICIoT2023 training/serving pipeline and model artifact layout. Its source-build instructions also require downloading data and training. Verify actual downloadable artifacts, license, metadata, and versions before depending on it.

## Checklist
- [ ] Confirm the model binary is actually available
- [ ] Inspect license and provenance
- [ ] Record compatible Python/library versions
- [ ] Load only trusted pickle/joblib artifacts (they can execute code)
- [ ] Extract exact feature names and order
- [ ] Reproduce preprocessing and label mapping
- [ ] Run a known sample prediction
- [ ] Only then expose inference through the SentinelIoT API

Never describe rule-based demo heuristics as ML predictions.
