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
    parser.add_argument("--port", default="auto", help="Arduino serial port, e.g. COM5, or auto")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    parser.add_argument("--poll-seconds", type=float, default=2.0)
    args = parser.parse_args()
    api = args.api.rstrip("/")
    seen = set()
    last_poll = 0.0
    port = args.port
    if port.lower() == "auto":
        from serial.tools import list_ports
        ports = list(list_ports.comports())
        if not ports:
            raise SystemExit("No serial device found. Connect the Arduino and check its USB cable/driver.")
        arduino_ports = [p for p in ports if any(k in (p.description or "").lower() for k in ("arduino", "usb serial", "ch340", "cp210", "ftdi"))]
        candidates = arduino_ports or ports
        if len(candidates) != 1:
            details = "\n".join(str(p.device) + ": " + str(p.description) for p in ports)
            raise SystemExit("More than one serial device found. Run with --port COMx.\n" + details)
        port = candidates[0].device
    print(f"Connecting to Arduino {port} and SentinelIoT {api}")
    with serial.Serial(port, 9600, timeout=0.25, write_timeout=1) as board:
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
                        status = event.get("status")
                        if status in {"suspicious", "normal"}:
                            board.write(b"A" if status == "suspicious" else b"N")
                            print("Alert relayed:", event.get("attack_type"), status)
                    if len(seen) > 2000:
                        seen.clear()
                    last_poll = now
            except (requests.RequestException, serial.SerialException) as exc:
                print("Agent connection error:", exc)
                time.sleep(2)

if __name__ == "__main__":
    main()
