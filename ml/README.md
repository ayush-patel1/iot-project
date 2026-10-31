# Pretrained ML integration

SentinelIoT calls the hosted pretrained CIC-IoT-2023 inference service from https://github.com/tarunbommawar27/iot-ids-xai.

- Dataset: CIC-IoT-2023
- Default classifier: LightGBM; Random Forest is also selectable
- The upstream API loads the trained model and fitted scaler. SentinelIoT sends named raw feature values; do not pre-scale them.
- GET /ml/health checks upstream model status.
- GET /ml/demo/0 through /ml/demo/9 runs upstream preloaded test samples (0-4 documented benign; 5-9 documented attack).
- POST /ml/predict accepts a JSON object with features, model and explain.

Example request body:
{
  "features": {
    "Number": 1, "Weight": 1, "Duration": 1, "IAT": 1,
    "urg_count": 0, "rst_count": 0, "Magnitue": 1, "Variance": 0,
    "Tot size": 60, "Max": 60, "AVG": 60, "Min": 60, "IPv": 4,
    "LLC": 0, "flow_duration": 1, "Tot sum": 60,
    "Protocol Type": 6, "Radius": 0, "Std": 0, "TCP": 1
  },
  "model": "lightgbm",
  "explain": true
}

The backend records model predictions and sends Arduino LED alerts for Attack predictions.

IMPORTANT: the model is hosted remotely, not copied into this repository. Its CIC-IoT-2023 feature schema is dataset-specific. `POST /lab/run` builds a synthetic 20-field profile from a bounded Attack Lab scenario and submits it to `/predict`. This is an integration demonstration only: the values are estimated from scenario metadata, not extracted from packets, and are not validated as genuine CIC-IoT-2023 flow statistics. Real live-traffic inference still requires a compatible packet/flow extractor and validation against the provider's preprocessing and feature semantics.

Set SENTINEL_MODEL_API to point at a compatible self-hosted API. Install backend dependencies with pip install -r backend/requirements.txt.
