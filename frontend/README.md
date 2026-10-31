# SentinelIoT dashboard

## Run locally
```bash
npm install
npm run dev
```

The Vite app expects the FastAPI service at `http://127.0.0.1:8000`. Override it with `VITE_API_URL` if needed.

The dashboard polls health, statistics, and recent demo events. Its scenario buttons call the backend's explicitly labeled rule-based demo endpoint. They do not claim to run ML inference.
