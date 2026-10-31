"""Read Arduino telemetry, publish it to SentinelIoT, and relay ML alerts.

Run on the same laptop as the USB-connected Arduino:
    pip install requests pyserial
    python network/device_agent.py --port COM3
"""
import argparse
import json
import time
import requests
import serial

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, help="Arduino port, e.g. COM3")
    parser.add_argument("--api", default="https://iot-project-avq0.onrender.com")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    api = args.api.rstrip("/")
    seen = set()
    last_poll = 0.0
    print(f"Connecting to Arduino {args.port} and SentinelIoT {api}")
    with serial.Serial(args.port, 9600, timeout=0.25, write_timeout=1) as board:
        time.sleep(2)
        print("Device agent running. Ctrl+C to stop.")
        while True:
            try:
                line = board.readline().decode("utf-8", errors="ignore").strip()
                if line.startswith("{"):
                    try:
                        telemetry = json.loads(line)
                        if "device_id" in telemetry:
                            response = requests.post(api + "/device/telemetry", json=telemetry, timeout=10)
                            response.raise_for_status()
                            print("Telemetry uploaded:", telemetry)
                    except (ValueError, requests.RequestException) as exc:
                        print("Telemetry upload error:", exc)
                now = time.monotonic()
                if now - last_poll >= max(1.0, args.poll_seconds):
                    response = requests.get(api + "/alerts", timeout=10)
                    response.raise_for_status()
                    for event in reversed(response.json()):
                        event_id = event.get("timestamp")
                        if not event_id or event_id in seen:
                            continue
                        seen.add(event_id)
                        board.write(b"A" if event.get("status") == "suspicious" else b"N")
                        print("Alert relayed:", event.get("attack_type"), event.get("status"))
                    if len(seen) > 2000:
                        seen.clear()
                    last_poll = now
            except (requests.RequestException, serial.SerialException) as exc:
                print("Agent connection error:", exc)
                time.sleep(2)

if __name__ == "__main__":
    main()
