"""Generate bounded benign/anomaly-like HTTP patterns against localhost only."""
import argparse, random, time
import requests
BASE="http://127.0.0.1:5001"

def run(scenario):
    if scenario=="normal":
        for _ in range(15):
            requests.get(BASE+random.choice(["/","/device","/health"]),timeout=2)
            time.sleep(random.uniform(.5,1.5))
    elif scenario=="burst":
        # Small bounded local burst; not a denial-of-service test.
        for _ in range(25):
            requests.get(BASE+"/health",timeout=2)
            time.sleep(.1)
    elif scenario=="failed_requests":
        for i in range(10):
            requests.get(f"{BASE}/missing/{i}",timeout=2)
            time.sleep(.25)
    elif scenario=="large_payload":
        requests.post(BASE+"/echo",json={"sample":"x"*4096},timeout=2)
    print(f"Completed local scenario: {scenario}")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--scenario",choices=["normal","burst","failed_requests","large_payload"],default="normal")
    run(parser.parse_args().scenario)
