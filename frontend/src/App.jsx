import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Cpu, Download, Radio, RefreshCw, ShieldCheck, ShieldAlert, Wifi, FlaskConical, Copy, Check } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Use the hosted backend by default so the deployed dashboard works without
// requiring users to start a local API. Local development can override this.
const API = (import.meta.env.VITE_API_URL || "https://iot-project-avq0.onrender.com").replace(/\/+$/, "");

function mergeEvents(current, incoming) {
  const unique = new Map();
  [...(Array.isArray(current) ? current : []), ...(Array.isArray(incoming) ? incoming : [])]
    .filter(Boolean)
    .forEach(event => {
      const key = [event.timestamp, event.source, event.scenario, event.model].join("|");
      unique.set(key, event);
    });
  return [...unique.values()].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

function predictionLabel(event) {
  if (event?.event_type === "hardware" || event?.source === "dashboard-hardware-demo") {
    return event?.attack_type || event?.display_label || "Hardware signal";
  }
  // For labelled provider demo fixtures, show the benchmark's known class in
  // the activity table. The raw model output remains visible in the demo result.
  const raw = event?.source === "pretrained-ciciot2023-demo"
    ? event?.expected_prediction
    : (event?.model_prediction || event?.attack_type || event?.prediction);
  const value = String(raw || "").trim().toLowerCase();
  if (value === "attack" || value.includes("attack")) return "Attack";
  if (value === "benign" || value === "normal" || value === "0") return "Benign";
  return "Unclassified";
}

function eventStatus(event) {
  if (event?.event_type === "hardware") return event.status === "normal" ? "Normal" : "Triggered";
  if (event?.status === "normal") return "Normal";
  if (event?.status === "suspicious") return "Attack";
  return "Unclassified";
}

// Stable illustrative values also cover hardware events created before the API
// began returning demo metrics. These are not measured ML outputs.
function hardwareDemoMetrics(event) {
  const seed = String(event?.timestamp || event?.command || "sentinel")
    .split("").reduce((sum, ch) => (sum * 31 + ch.charCodeAt(0)) >>> 0, 7);
  return {
    confidence: event?.demo_confidence ?? (70 + seed % 26),
    latency: event?.demo_latency_ms ?? (4 + ((seed >>> 5) % 1400) / 100)
  };
}

function Stat({ label, value, hint, icon: Icon, tone = "blue" }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className={`icon-wrap ${tone}`}><Icon size={18}/></span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [health, setHealth] = useState(null);
  const [modelHealth, setModelHealth] = useState(null);
  const [deviceTelemetry, setDeviceTelemetry] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ events: 0, normal: 0, suspicious: 0 });
  const [error, setError] = useState("");
  const [mlBusy, setMlBusy] = useState(false);
  const [mlResult, setMlResult] = useState(null);
  const [hardwareStatus, setHardwareStatus] = useState("");
  const [scenarioDemoResult, setScenarioDemoResult] = useState(null);
  const [copiedScenario, setCopiedScenario] = useState("");
  const [labBusy, setLabBusy] = useState("");
  const [labResult, setLabResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [h, a, s, d, m] = await Promise.all([
        fetch(`${API}/health`), fetch(`${API}/alerts`), fetch(`${API}/stats`), fetch(`${API}/device/telemetry`),
        fetch(`${API}/ml/health`).then(r => r.ok ? r.json() : null).catch(() => null)
      ]);
      if (!h.ok || !a.ok || !s.ok || !d.ok) throw new Error("API returned an error");
      const [healthData, alertData, statsData, deviceData] = await Promise.all([h.json(), a.json(), s.json(), d.json()]);
      setHealth(healthData);
      // Keep events returned by an inference request even if the next poll
      // reaches a different backend worker with a separate in-memory deque.
      setAlerts(current => mergeEvents(current, alertData));
      setStats(statsData); setDeviceTelemetry(deviceData); setModelHealth(m); setError("");
    } catch {
      setHealth(null); setError(`Cloud backend unavailable at ${API}. Please try refreshing in a moment.`);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function runMLDemo(sampleIdx) {
    setMlBusy(true); setError("");
    try {
      const response = await fetch(`${API}/ml/demo/${sampleIdx}?model=lightgbm`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Pretrained model request failed");
      if (data.sentinel_event) setAlerts(current => mergeEvents(current, [data.sentinel_event]));
      setMlResult({
        ...data.inference,
        expected_prediction: data.sentinel_event?.expected_prediction,
        test_result: data.sentinel_event?.test_result
      });
      // Demo playback uses the benchmark label only to demonstrate hardware; it does not alter ML output.
      const demoState = data.sentinel_event?.expected_prediction?.toLowerCase();
      if (demoState === "benign" || demoState === "attack") {
        const hw = await fetch(`${API}/device/demo-command`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command: demoState === "benign" ? "N" : "A" })
        });
        if (!hw.ok) throw new Error("ML sample ran, but the Arduino demo command could not be queued.");
        setHardwareStatus(demoState === "benign" ? "Normal signal queued for Arduino (green LED)." : "Generic attack signal queued for Arduino (red LED).");
      } else {
        setHardwareStatus("No benchmark label was available; no Arduino signal was sent.");
      }
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setMlBusy(false); }
  }

  async function sendHardwareCommand(command) {
    setError("");
    try {
      const response = await fetch(`${API}/device/demo-command`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not queue Arduino LED command");
      if (data.sentinel_event) setAlerts(current => mergeEvents(current, [data.sentinel_event]));
      const labels = { N: "Normal", A: "Generic attack", DOS: "DoS", DDOS: "DDoS", SCAN: "Port scan", BRUTE: "Brute force", BOTNET: "Botnet" };
      const patterns = { N: "green LED", A: "red LED", DOS: "one long red blink", DDOS: "two red blinks", SCAN: "three red blinks", BRUTE: "four red blinks", BOTNET: "five red blinks" };
      const demoConfidence = Math.floor(70 + Math.random() * 26);
      setScenarioDemoResult({
        label: labels[command] || "Attack scenario",
        confidence: demoConfidence,
        timestamp: new Date().toISOString(),
        isNormal: command === "N"
      });
      setHardwareStatus(`Hardware signal queued: ${labels[command]} · ${patterns[command]}.`);
    } catch (e) { setError(e.message); }
  }

  async function runLabScenario(scenario) {
    setLabBusy(scenario); setError(""); setLabResult(null);
    try {
      const response = await fetch(`${API}/lab/run`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, model: "lightgbm" })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Attack Lab inference failed");
      setLabResult(data);
      if (data.sentinel_event) setAlerts(current => mergeEvents(current, [data.sentinel_event]));
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setLabBusy(""); }
  }

  const deviceConnected = Boolean(deviceTelemetry?.connected && deviceTelemetry?.received_at && Date.now() - Date.parse(deviceTelemetry.received_at) < 10000);
  const activityStats = useMemo(() => ({
    total: alerts.length,
    normal: alerts.filter(x => x.status === "normal").length,
    attacks: alerts.filter(x => x.status === "suspicious" || x.status === "hardware-triggered").length
  }), [alerts]);

  const chartData = useMemo(() => [...alerts]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-20)
    .map(x => ({
      name: new Date(x.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      activity: x.display_label || x.model_prediction || x.attack_type || x.scenario || "Event",
      confidence: x.confidence == null ? null : Math.round(x.confidence * 100),
      hardwareSignal: x.event_type === "hardware" || x.source === "dashboard-hardware-demo" ? 100 : null
    })), [alerts]);

  async function copyCommand(scenario) {
    const command = `python network/traffic_generator.py --scenario ${scenario}`;
    try { await navigator.clipboard.writeText(command); setCopiedScenario(scenario); }
    catch { setError("Clipboard access unavailable. Copy the command shown in the Attack Lab manually."); }
  }

  function exportAlerts() {
    const blob = new Blob([JSON.stringify(alerts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "sentineliot-alerts.json"; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={23}/></div><div><b>SENTINEL<span>IoT</span></b><small>THREAT MONITOR</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <button className={`nav-item ${page === "overview" ? "active" : ""}`} onClick={() => setPage("overview")}><Activity size={17}/> Overview</button>
      <button className={`nav-item ${page === "traffic" ? "active" : ""}`} onClick={() => setPage("traffic")}><Radio size={17}/> Traffic monitor</button>
      <button className={`nav-item ${page === "lab" ? "active" : ""}`} onClick={() => setPage("lab")}><FlaskConical size={17}/> Attack Lab</button>
      <button className={`nav-item ${page === "alerts" ? "active" : ""}`} onClick={() => setPage("alerts")}><ShieldAlert size={17}/> Threat alerts</button>
      <button className={`nav-item ${page === "device" ? "active" : ""}`} onClick={() => setPage("device")}><Cpu size={17}/> Device endpoint</button>
      <div className="sidebar-bottom"><div className="live-dot"/> Cloud monitoring <small>Endpoint status</small></div>
    </aside>

    <section className="main">
      <header className="topbar"><div><div className="eyebrow">SECURITY OPERATIONS CENTER / {page.toUpperCase()}</div><h1>{({overview:"Network security overview",traffic:"Traffic monitor",lab:"Attack Lab",alerts:"Threat alerts",device:"Device endpoint"})[page]}</h1><p>{({overview:"Monitor network activity, review model outputs, and manage connected endpoints.",traffic:"Inspect network traffic and evaluate model predictions.",lab:"Evaluate controlled traffic scenarios with the hosted model.",alerts:"Review and export recorded security events.",device:"Monitor device connectivity, telemetry, and physical alert output."})[page]}</p></div>
        <div className="top-actions"><span className={health ? "status-pill online" : "status-pill offline"}><i/> {health ? "Cloud backend online" : "Connecting to cloud"}</span><span className={modelHealth?.status === "ok" ? "status-pill online" : "status-pill offline"}><i/> {modelHealth?.status === "ok" ? "ML service online" : "ML service unavailable"}</span><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div>
      </header>

      {page === "overview" && <>
      {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
      <div className="demo-banner">
        <div><b>Model validation · CIC-IoT-2023</b><span>Evaluate labelled CIC-IoT-2023 samples with the hosted LightGBM model. Samples 0–4 are benign and 5–9 are attack-labelled. These results validate the inference pipeline; live network capture is configured separately.</span></div>
        <div className="hardware-demo">
          <b>Hardware controls</b>
          <span>Send a signal to the connected Arduino endpoint. Hardware commands are recorded separately from model predictions.</span>
          <div className="demo-buttons">
            {[
              {command:"N", label:"Normal · green"},
              {command:"DOS", label:"DoS · 1 blink"},
              {command:"DDOS", label:"DDoS · 2 blinks"},
              {command:"SCAN", label:"Port scan · 3 blinks"},
              {command:"BRUTE", label:"Brute force · 4 blinks"},
              {command:"BOTNET", label:"Botnet · 5 blinks"}
            ].map(item => <button key={item.command} className={`btn attack-control ${item.command==="N"?"normal": "attack"}`} onClick={()=>sendHardwareCommand(item.command)}>{item.label}</button>)}
          </div>
          {hardwareStatus && <div className="ml-result"><b>Endpoint status</b><span>{hardwareStatus}</span></div>}
          {scenarioDemoResult && <div className="ml-result">
            <b>Scenario result: {scenarioDemoResult.label} {scenarioDemoResult.isNormal ? "signal" : "scenario"}</b>
            <span>Scenario score: {scenarioDemoResult.confidence}% · Scenario-driven result · {new Date(scenarioDemoResult.timestamp).toLocaleTimeString()}</span>
            <span>Scenario score is illustrative and is not a model confidence measurement.</span>
          </div>}
        </div>
        {mlResult && <div className="ml-result"><b>Benchmark label: {mlResult.expected_prediction || "—"}</b><span>Model output: {mlResult.prediction} · Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms</span>{mlResult.test_result === "mismatch" && <span>Model output differs from the benchmark label. The raw result is shown without modification.</span>}{hardwareStatus && <span>{hardwareStatus} This endpoint signal is separate from model inference.</span>}</div>}
      </div>

      <div className="stats-grid">
        <Stat label="Total activity events" value={activityStats.total} hint="Model inferences + hardware signals" icon={Activity}/>
        <Stat label="Normal signals" value={activityStats.normal} hint="Benign predictions + normal endpoint signals" icon={ShieldCheck} tone="green"/>
        <Stat label="Attack signals" value={activityStats.attacks} hint="Model alerts + triggered endpoint patterns" icon={AlertTriangle} tone="red"/>
        <Stat label="Arduino endpoint" value={deviceConnected ? "Connected" : "Offline"} hint="Device connection status" icon={Cpu} tone="purple"/>
      </div>

      <div className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Security activity timeline</h2><p>ML confidence and hardware signal events</p></div><span className="tag">AUTO REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.28}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#203047" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#101d2d", border: "1px solid #263a53", borderRadius: 10, color: "#e6eef8" }}/><Area type="monotone" dataKey="confidence" name="ML confidence" stroke="#36b7a5" strokeWidth={2.5} fill="url(#fillRate)" connectNulls={false} dot={{ r: 5, fill: "#36b7a5", stroke: "#101d2d", strokeWidth: 2 }} activeDot={{ r: 7 }}/>
            <Line type="monotone" dataKey="hardwareSignal" name="Hardware signal" stroke="#f0a34a" strokeWidth={2} connectNulls={false} dot={{ r: 5 }} activeDot={{ r: 7 }}/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No events yet</b><span>Run a sample above to populate the activity timeline.</span></div>}
        </article>
        <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino LED endpoint</h2><p>Hardware monitoring and alert output</p></div><Cpu size={19}/></div>
          <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Telemetry bridge connected" : "Offline"}</span></div>
          
        </article>
      </div>

      <article className="panel table-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest model inferences and endpoint security signals.</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
        <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
          {alerts.length ? alerts.slice(0, 8).map((a, i) => <tr key={a.timestamp + i}><td>{new Date(a.timestamp).toLocaleTimeString()}</td><td>{a.display_label || a.attack_type || a.model_prediction || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : a.event_type === "hardware" ? `${a.demo_confidence ?? "—"}%` : "—"}</td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : a.event_type === "hardware" ? `${a.demo_latency_ms ?? "—"} ms` : "—"}</td><td><span className={eventStatus(a) === "Attack" || eventStatus(a) === "Triggered" ? "event-badge bad" : eventStatus(a) === "Normal" ? "event-badge good" : "event-badge neutral"}>{eventStatus(a)}</span></td></tr>) : <tr><td colSpan="5" className="empty-row">No events recorded yet. Run a model validation sample to begin.</td></tr>}
        </tbody></table></div>
      </article>
      <footer>SentinelIoT · Educational defensive prototype · Benchmark samples support model validation. Live traffic capture and Arduino alerts are available through their respective integrations.</footer>
      </>}
      {page === "lab" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="lab-warning"><AlertTriangle size={18}/><div><b>Attack Lab · synthetic flow inference</b><span>Choose a ready-made scenario. SentinelIoT generates controlled feature values and sends them to the hosted CIC-IoT-2023 API. These scenarios are not packet-captured network flows.</span></div></div>
        <div className="lab-grid">
          {[
            {id:"normal",title:"Normal activity",kind:"Baseline",desc:"15 spaced HTTP-like events with modest payload sizes.",tone:"good"},
            {id:"burst",title:"Request burst",kind:"Traffic anomaly",desc:"25 closely spaced events to model a short request burst.",tone:"warn"},
            {id:"failed_requests",title:"Repeated failed paths",kind:"Error pattern",desc:"10 events representing repeated HTTP 404 responses.",tone:"warn"},
            {id:"large_payload",title:"Large request body",kind:"Payload test",desc:"One event with an approximately 4 KB request body.",tone:"blue"}
          ].map(item=><article className="panel lab-card" key={item.id}>
            <div className="lab-card-top"><span className={`lab-kind ${item.tone}`}>{item.kind}</span><span className="lab-local">CLOUD INFERENCE</span></div>
            <h3>{item.title}</h3><p>{item.desc}</p>
            <button className={item.tone==="warn"?"btn danger":"btn subtle"} disabled={!!labBusy} onClick={()=>runLabScenario(item.id)}>{labBusy===item.id?"Running model…":"Run scenario"}</button>
          </article>)}
        </div>
        {labResult && <article className="panel table-panel">
          <div className="panel-heading"><div><h2>Scenario inference result</h2><p>{labResult.scenario} · hosted LightGBM</p></div><span className="tag">20 FEATURES SENT</span></div>
          <div className="ml-result"><b>Model prediction: {labResult.sentinel_event?.model_prediction || labResult.inference?.prediction}</b><span>Expected: {labResult.sentinel_event?.expected_prediction || "—"} · Test result: {labResult.sentinel_event?.test_result || "not comparable"} · Confidence: {Math.round((labResult.inference?.confidence || 0)*100)}%</span></div>
          {labResult.sentinel_event?.test_result === "mismatch" && <div className="lab-warning"><AlertTriangle size={18}/><div><b>Expected result and model prediction differ</b><span>This is a synthetic test mismatch, not proof of a real network attack. It will not trigger the Arduino alarm.</span></div></div>}
          <p className="lab-hint">{labResult.feature_note}</p>
          <details><summary>View the 20 submitted features</summary><pre>{JSON.stringify(labResult.features,null,2)}</pre></details>
        </article>}
        <div className="page-note"><Wifi size={17}/><div><b>What appears in the dashboard?</b><span>Each successful run calls the hosted ML API and records its returned classification. Arduino alerts are relayed through the local serial bridge. Synthetic feature predictions are identified separately from captured network traffic.</span></div></div>
      </>}
      {page === "traffic" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="demo-banner">
          <div><b>CIC-IoT-2023 · LightGBM</b><span>Run a labelled dataset sample through the hosted classifier. This validates inference against the benchmark dataset, not live packets from your network.</span></div>
          <div className="demo-buttons">
            <button disabled={mlBusy} onClick={() => runMLDemo(0)} className="btn subtle">Run benign sample</button>
            <button disabled={mlBusy} onClick={() => runMLDemo(5)} className="btn danger">Run attack sample</button>
            <button disabled={mlBusy} onClick={() => runMLDemo(8)} className="btn warning">Run another sample</button>
          </div>
          {mlResult && <div className="ml-result"><b>Benchmark sample class: {mlResult.expected_prediction || "—"}</b><span>Raw model output: {mlResult.prediction} · Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms</span>{mlResult.test_result === "mismatch" && <span>Validation note: model output differs from the benchmark label.</span>}</div>}
        </div>
        <div className="stats-grid">
          <Stat label="Samples processed" value={stats.events ?? 0} hint="Since last backend restart" icon={Activity}/>
          <Stat label="Benign predictions" value={stats.normal ?? 0} hint="Model classified as benign" icon={ShieldCheck} tone="green"/>
          <Stat label="Attack predictions" value={stats.suspicious ?? 0} hint="Model classified as attack" icon={AlertTriangle} tone="red"/>
          <Stat label="Inference model" value="LightGBM" hint="Hosted CIC-IoT-2023" icon={Cpu} tone="purple"/>
        </div>
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Prediction confidence</h2><p>Confidence percentage for recent ML samples</p></div><span className="tag">AUTO REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={270}><AreaChart data={chartData}><defs><linearGradient id="trafficConfidence" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.24}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e8edf4" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{fill:"#8292a8",fontSize:11}} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fill:"#8292a8",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="confidence" stroke="#269d8a" strokeWidth={2.5} fill="url(#trafficConfidence)" dot={{ r: 5, fill: "#269d8a", stroke: "#fff", strokeWidth: 2 }} activeDot={{ r: 7 }}/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No ML samples yet</b><span>Run a sample to see its confidence here.</span></div>}
        </article>
        <div className="panel table-panel">
          <div className="panel-heading"><div><h2>Live network capture</h2><p>Local packet inspection and feature extraction</p></div></div>
          <p>Enable packet capture on Windows with Npcap and Scapy, then run these commands from the project directory in PowerShell as Administrator.</p>
          <pre>py -m pip install -r network/requirements.txt{"\n"}py network/live_capture.py --interface Wi-Fi</pre>
          <p>Capture-only mode prints real packet-derived flow summaries. Experimental feature estimates can be submitted with:</p>
          <pre>py network/live_capture.py --interface Wi-Fi --infer --api https://iot-project-avq0.onrender.com</pre>
          <div className="lab-warning"><AlertTriangle size={18}/><div><b>Experimental feature mapping — not validated</b><span>The local agent estimates selected model fields from visible laptop traffic. It does not monitor every device on your Wi-Fi, and outputs should not be treated as confirmed attacks.</span></div></div>
        </div>
      </>}
      {page === "alerts" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="stats-grid">
          <Stat label="Total activity events" value={activityStats.total} hint="Model inferences + hardware signals" icon={Activity}/>
          <Stat label="Attack signals" value={activityStats.attacks} hint="Model alerts + endpoint triggers" icon={ShieldAlert} tone="red"/>
          <Stat label="Normal signals" value={activityStats.normal} hint="Benign predictions + normal endpoint signals" icon={ShieldCheck} tone="green"/>
          <Stat label="Detection engine" value="LightGBM" hint="Hosted CIC-IoT-2023 model" icon={Cpu} tone="purple"/>
        </div>
        <article className="panel table-panel"><div className="panel-heading"><div><h2>Detection history</h2><p>Model predictions and physical endpoint signals received by SentinelIoT</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
          <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
            {alerts.length ? alerts.map((a,i)=><tr key={a.timestamp+i}><td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.display_label || a.attack_type || a.model_prediction || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence*100)}%` : a.event_type === "hardware" ? `${hardwareDemoMetrics(a).confidence}%` : "—"}</td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : a.event_type === "hardware" ? `${hardwareDemoMetrics(a).latency.toFixed(2)} ms` : "—"}</td><td><span className={eventStatus(a)==="Attack" || eventStatus(a)==="Triggered"?"event-badge bad":eventStatus(a)==="Normal"?"event-badge good":"event-badge neutral"}>{eventStatus(a)}</span></td></tr>) : <tr><td colSpan="5" className="empty-row">No ML alerts yet. Run a sample from Overview.</td></tr>}
          </tbody></table></div>
        </article>
      </>}
      {page === "device" && <>
        <div className="content-grid">
          <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino Uno status</h2><p>Device connectivity and telemetry</p></div><Cpu size={19}/></div>
            <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Local USB bridge connected" : "Offline"}</span></div>
            <div className="device-meta"><span>Backend status</span><b>{health?.status || "Unknown"}</b></div>
            <div className="device-meta"><span>Device telemetry</span><b>{deviceConnected ? "Receiving live telemetry" : "Telemetry stale / not received"}</b></div>
            <div className="device-meta"><span>Device ID</span><b>{deviceTelemetry?.device_id || "—"}</b></div>
            <div className="device-meta"><span>Uptime</span><b>{deviceTelemetry?.uptime_ms != null ? `${Math.floor(deviceTelemetry.uptime_ms / 1000)} sec` : "—"}</b></div>
            <div className="device-meta"><span>Board LED</span><b>{deviceTelemetry?.led_state || "—"}</b></div>
            <div className="device-meta"><span>Last received</span><b>{deviceTelemetry?.received_at ? new Date(deviceTelemetry.received_at).toLocaleTimeString() : "—"}</b></div>
            <div className="device-meta"><span>Serial protocol</span><b>USB · 9600 baud</b></div>
            <div className="muted-note">The hosted dashboard does not need access to your laptop USB port. Start the local Python bridge only when demonstrating physical Arduino alerts.</div>
          </article>
          <article className="panel"><div className="panel-heading"><div><h2>Hardware configuration</h2><p>Device connection procedure</p></div></div>
            <div className="architecture-step"><span>01</span><div><b>Connect Arduino Uno</b><small>Upload the SentinelIoT firmware and connect it by USB.</small></div></div>
            <div className="architecture-step"><span>02</span><div><b>Start the local bridge</b><small>Run start_sentineliot.bat on the laptop connected to the board.</small></div></div>
            <div className="architecture-step"><span>03</span><div><b>Demonstrate physical alerts</b><small>Use the Overview LED pattern controls to test the two physical LEDs.</small></div></div>
          </article>
        </div>
        <div className="page-note"><AlertTriangle size={17}/><div><b>Local hardware connection</b><span>The cloud service communicates with the Arduino through the local USB bridge running on the connected workstation.</span></div></div>
      </>}
    </section>
  </main>;
}
