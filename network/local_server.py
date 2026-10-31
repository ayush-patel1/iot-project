"""Local-only HTTP target for SentinelIoT traffic demos."""
from flask import Flask, jsonify, request
app=Flask(__name__)

@app.get("/")
def index():
    return jsonify(status="healthy",service="sentineliot-local-demo")

@app.get("/device")
def device():
    return jsonify(device_id="ARDUINO_01",telemetry="simulated",online=True)

@app.get("/health")
def health():
    return jsonify(status="ok")

@app.get("/missing/<item>")
def missing(item):
    return jsonify(error="not found",item=item),404

@app.post("/echo")
def echo():
    body=request.get_json(silent=True) or {}
    return jsonify(received=True,keys=list(body.keys()))

if __name__=="__main__":
    app.run(host="127.0.0.1",port=5001,debug=False)
