"""Capture this Windows laptop's own Wi-Fi traffic and optionally submit flow estimates.

Install:
    py -m pip install -r network/requirements.txt

Capture only (safe first run):
    py network/live_capture.py --interface Wi-Fi

Capture and send experimental feature estimates to SentinelIoT:
    py network/live_capture.py --interface Wi-Fi --infer --api https://iot-project-avq0.onrender.com

Run PowerShell as Administrator if Npcap reports access denied. Stop with Ctrl+C.
Only capture traffic on networks/devices you own or are authorized to monitor.

IMPORTANT: This is a best-effort packet-to-feature adapter. It does not reproduce
the CIC-IoT-2023 extraction pipeline. Several selected feature semantics (notably
Weight, Number, Magnitue, and Header_Length) are approximated. Inference is
therefore experimental and must not be treated as a validated security verdict.
"""
from __future__ import annotations

import argparse
import statistics
import time
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timezone

import requests
from scapy.all import IP, IPv6, TCP, UDP, sniff
from scapy.arch.windows import get_windows_if_list

WINDOW_SECONDS = 10.0
MIN_PACKETS = 3
API_TIMEOUT = 20


@dataclass
class Flow:
    started: float
    last_seen: float
    sizes: list[int] = field(default_factory=list)
    times: list[float] = field(default_factory=list)
    urg: int = 0
    rst: int = 0
    syn: int = 0
    ack: int = 0
    psh: int = 0
    ip_header_bytes: int = 0
    https: int = 0
    protocol: str = "other"

    def add(self, packet, now: float) -> None:
        size = len(packet)
        self.sizes.append(size)
        self.times.append(now)
        self.last_seen = now
        if IP in packet:
            self.ip_header_bytes += int(packet[IP].ihl or 5) * 4
        elif IPv6 in packet:
            self.ip_header_bytes += 40
        if TCP in packet:
            flags = int(packet[TCP].flags)
            self.urg += int(bool(flags & 0x20))
            self.rst += int(bool(flags & 0x04))
            self.syn += int(bool(flags & 0x02))
            self.ack += int(bool(flags & 0x10))
            self.psh += int(bool(flags & 0x08))
            self.https += int(packet[TCP].sport == 443 or packet[TCP].dport == 443)
            self.protocol = "tcp"
        elif UDP in packet:
            self.https += int(packet[UDP].sport == 443 or packet[UDP].dport == 443)
            self.protocol = "udp"

    def features(self) -> dict[str, float]:
        sizes = self.sizes
        n = len(sizes)
        duration = max(self.last_seen - self.started, 1e-6)
        gaps = [b - a for a, b in zip(self.times, self.times[1:])]
        avg = statistics.fmean(sizes)
        variance = statistics.pvariance(sizes) if n > 1 else 0.0
        std = variance ** 0.5
        # Approximate mappings to the provider's 20 selected field names.
        # They are deliberately documented as estimates, not dataset-equivalent.
        return {
            "Number": float(n),
            "Weight": float(sum(sizes) / duration),
            "Duration": float(duration),
            "IAT": float(statistics.fmean(gaps) * 1_000_000) if gaps else 0.0,
            "urg_count": float(self.urg),
            "rst_count": float(self.rst),
            "syn_count": float(self.syn),
            "ack_flag_number": float(self.ack),
            "psh_flag_number": float(self.psh),
            "Header_Length": float(self.ip_header_bytes),
            "flow_duration": float(duration * 1_000_000),
            "Variance": float(variance),
            "Std": float(std),
            "Tot size": float(avg),
            "Tot sum": float(sum(sizes)),
            "Magnitue": float((avg * avg + variance) ** 0.5),
            "Rate": float(n / duration),
            "Srate": float(n / duration),
            "HTTPS": float(int(self.https > 0)),
            "Max": float(max(sizes)),
        }


def interface_for(name: str) -> str:
    interfaces = get_windows_if_list()
    match = next((x for x in interfaces if x.get("name") == name), None)
    if not match:
        available = ", ".join(sorted({x.get("name", "?") for x in interfaces}))
        raise SystemExit(f"Interface '{name}' not found. Available: {available}")
    return r"\Device\NPF_" + match["guid"]


def packet_key(packet):
    if IP in packet:
        src, dst = packet[IP].src, packet[IP].dst
        proto = "tcp" if TCP in packet else "udp" if UDP in packet else str(packet[IP].proto)
    elif IPv6 in packet:
        src, dst = packet[IPv6].src, packet[IPv6].dst
        proto = "tcp" if TCP in packet else "udp" if UDP in packet else str(packet[IPv6].nh)
    else:
        return None
    if TCP in packet:
        sport, dport = int(packet[TCP].sport), int(packet[TCP].dport)
    elif UDP in packet:
        sport, dport = int(packet[UDP].sport), int(packet[UDP].dport)
    else:
        sport = dport = 0
    left, right = sorted(((src, sport), (dst, dport)))
    return (proto, left, right)


def main():
    parser = argparse.ArgumentParser(description="SentinelIoT live Wi-Fi packet capture")
    parser.add_argument("--interface", default="Wi-Fi", help="Windows adapter name (default: Wi-Fi)")
    parser.add_argument("--api", default="https://iot-project-avq0.onrender.com")
    parser.add_argument("--infer", action="store_true", help="Submit experimental flow feature estimates to ML")
    parser.add_argument("--window", type=float, default=WINDOW_SECONDS, help="Flow aggregation window in seconds")
    parser.add_argument("--min-packets", type=int, default=MIN_PACKETS)
    parser.add_argument("--model", choices=("lightgbm", "randomforest"), default="lightgbm")
    args = parser.parse_args()
    if args.window < 1 or args.min_packets < 2:
        parser.error("--window must be >=1 and --min-packets must be >=2")

    iface = interface_for(args.interface)
    api = args.api.rstrip("/")
    flows: dict[tuple, Flow] = {}
    last_flush = time.monotonic()
    counts = {"packets": 0, "flows": 0, "submitted": 0, "errors": 0}
    print(f"Capturing {args.interface} ({iface})")
    print("Mode:", "EXPERIMENTAL ML inference enabled" if args.infer else "capture-only (no model calls)")
    print("Flow window:", args.window, "seconds. Ctrl+C to stop.")

    def on_packet(packet):
        nonlocal last_flush
        now = time.monotonic()
        key = packet_key(packet)
        if key is None:
            return
        flow = flows.get(key)
        if flow is None:
            flow = Flow(started=now, last_seen=now)
            flows[key] = flow
        flow.add(packet, now)
        counts["packets"] += 1

        if now - last_flush >= args.window:
            completed = list(flows.items())
            flows.clear()
            last_flush = now
            for flow_key, item in completed:
                if len(item.sizes) < args.min_packets:
                    continue
                features = item.features()
                counts["flows"] += 1
                print(f"FLOW {counts['flows']}: {flow_key[0]} packets={len(item.sizes)} "
                      f"bytes={int(features['Tot sum'])} duration={features['Duration']:.3f}s")
                if args.infer:
                    payload = {"features": features, "model": args.model, "explain": False,
                               "source": "live-wifi-capture-experimental"}
                    try:
                        response = requests.post(api + "/ml/predict", json=payload, timeout=API_TIMEOUT)
                        response.raise_for_status()
                        result = response.json().get("inference", {})
                        counts["submitted"] += 1
                        print("  ML:", result.get("prediction"), "confidence=", result.get("confidence"),
                              "latency_ms=", result.get("latency_ms"))
                    except requests.RequestException as exc:
                        counts["errors"] += 1
                        print("  ML submission failed:", exc)
            print("STATS:", counts)

    try:
        sniff(iface=iface, prn=on_packet, store=False)
    except KeyboardInterrupt:
        print("\nCapture stopped. Final stats:", counts)


if __name__ == "__main__":
    main()
