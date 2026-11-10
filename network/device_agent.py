"""Bridge a USB-connected Arduino to the hosted SentinelIoT backend.

Only this small process runs locally; the dashboard and API stay hosted.
"""
import argparse
import json
import time

import requests
import serial
from serial.tools import list_ports

DEFAULT_API = "https://iot-project-avq0.onrender.com"


def find_arduino_port():
    ports = list(list_ports.comports())
    if not ports:
        raise SystemExit("No serial device found. Connect the Arduino by USB and try again.")
    keywords = ("arduino", "usb serial", "ch340", "cp210", "ftdi")
    matches = [p for p in ports if any(k in (p.description or "").lower() for k in keywords)]
    candidates = matches or ports
    if len(candidates) != 1:
        details = "\n".join(f"{p.device}: {p.description}" for p in ports)
        raise SystemExit("Multiple serial devices found. Set ARDUINO_PORT in the BAT file.\n" + details)
    return candidates[0].device


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", default="auto", help="Arduino serial port or auto")
    parser.add_argument("--api", default=DEFAULT_API, help="Hosted SentinelIoT API URL")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    api = args.api.rstrip("/")
    port = find_arduino_port() if args.port.lower() == "auto" else args.port
    print(f"Arduino: {port}")
    print(f"Hosted backend: {api}")
    print("Keep this window open while demonstrating. Ctrl+C stops the bridge.")

    last_command_id = 0
    seen_alerts = set()
    last_poll = 0.0
    with serial.Serial(port, 9600, timeout=0.2, write_timeout=1) as board:
        time.sleep(2)
        print("Arduino connected. Uploading telemetry and waiting for dashboard demo commands...")
        while True:
            try:
                line = board.readline().decode("utf-8", errors="ignore").strip()
                if line.startswith("{"):
                    try:
                        telemetry = json.loads(line)
                        if "device_id" in telemetry:
                            response = requests.post(api + "/device/telemetry", json=telemetry, timeout=10)
                            response.raise_for_status()
                    except (ValueError, requests.RequestException) as exc:
                        print("Telemetry upload error:", exc)

                now = time.monotonic()
                if now - last_poll >= max(1.0, args.poll_seconds):
                    response = requests.get(api + "/device/commands", params={"after_id": last_command_id}, timeout=10)
                    response.raise_for_status()
                    for item in response.json():
                        command_id = int(item["id"])
                        command = item["command"]
                        if command in ("A", "N"):
                            board.write(command.encode("ascii"))
                            print("Dashboard demo command:", item["state"], "->", "red LED + buzzer" if command == "A" else "green LED")
                        last_command_id = max(last_command_id, command_id)

                    # Keep support for validated backend alerts as well.
                    response = requests.get(api + "/alerts", timeout=10)
                    response.raise_for_status()
                    for event in reversed(response.json()):
                        event_id = event.get("timestamp")
                        if not event_id or event_id in seen_alerts:
                            continue
                        seen_alerts.add(event_id)
                        if event.get("source") == "pretrained-ciciot2023-demo":
                            continue
                        status = event.get("status")
                        if status in {"suspicious", "normal"}:
                            board.write(b"A" if status == "suspicious" else b"N")
                            print("Validated alert relayed:", status)
                    if len(seen_alerts) > 2000:
                        seen_alerts.clear()
                    last_poll = now
            except (requests.RequestException, serial.SerialException) as exc:
                print("Connection error; retrying:", exc)
                time.sleep(2)


if __name__ == "__main__":
    main()
