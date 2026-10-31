"""Relay new hosted SentinelIoT ML events to an Arduino Uno over USB serial.

Run on the laptop that the Uno is plugged into:
    pip install requests pyserial
    python network/arduino_bridge.py --port COM3
Use /dev/ttyACM0 or /dev/ttyUSB0 on Linux as appropriate.
"""
import argparse
import time
import requests
import serial

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", required=True, help="Arduino serial port, e.g. COM3")
    parser.add_argument("--api", default="https://iot-project-avq0.onrender.com")
    parser.add_argument("--interval", type=float, default=2.0)
    args = parser.parse_args()
    api = args.api.rstrip("/")
    seen = set()
    print(f"Connecting to {api} and Arduino on {args.port}...")
    with serial.Serial(args.port, 9600, timeout=1, write_timeout=1) as board:
        time.sleep(2)
        print("Bridge active. Ctrl+C to stop.")
        while True:
            try:
                response = requests.get(api + "/alerts", timeout=10)
                response.raise_for_status()
                events = response.json()
                for event in reversed(events):
                    event_id = event.get("timestamp")
                    if not event_id or event_id in seen:
                        continue
                    seen.add(event_id)
                    command = b"A" if event.get("status") == "suspicious" else b"N"
                    board.write(command)
                    print(f"{event_id}: {event.get('attack_type')} -> {command.decode()}")
                if len(seen) > 2000:
                    seen = set(list(seen)[-500:])
            except (requests.RequestException, serial.SerialException, ValueError) as exc:
                print(f"Bridge error: {exc}")
            time.sleep(max(0.5, args.interval))

if __name__ == "__main__":
    main()
