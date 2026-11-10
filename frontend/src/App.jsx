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
  if (event?.source === "dashboard-hardware-demo") return "Demo";
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
        setHardwareStatus(demoState === "benign" ? "Normal demo signal queued for Arduino (green LED)." : "Generic attack demo signal queued for Arduino (red LED).");
      } else {
        setHardwareStatus("No benchmark label was available; no Arduino demo signal was sent.");
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
      const labels = { N: "Normal / green LED", A: "Generic attack / red LED", DOS: "DoS / one long red blink", DDOS: "DDoS / two red blinks", SCAN: "Port scan / three red blinks", BRUTE: "Brute force / four red blinks", BOTNET: "Botnet / five red blinks" };
      setHardwareStatus(`Queued hardware demo: ${labels[command]}. Manual pattern test, not an ML detection.`);
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

  const chartData = useMemo(() => [...alerts]
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-20)
    .map(x => ({
      name: new Date(x.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      activity: x.display_label || x.model_prediction || x.attack_type || x.scenario || "Event",
      confidence: x.confidence == null ? null : Math.round(x.confidence * 100),
      hardwareSignal: x.source === "dashboard-hardware-demo" ? 100 : null
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
      <div className="sidebar-bottom"><div className="live-dot"/> Cloud demo mode <small>Hardware optional</small></div>
    </aside>

    <section className="main">
      <header className="topbar"><div><div className="eyebrow">SECURITY OPERATIONS CENTER / {page.toUpperCase()}</div><h1>{({overview:"Network security overview",traffic:"Traffic monitor",lab:"Attack Lab",alerts:"Threat alerts",device:"Device endpoint"})[page]}</h1><p>{({overview:"Run a guided security demo using the hosted ML service.",traffic:"Explore benchmark inference and optional local network capture.",lab:"Run ready-made synthetic traffic scenarios through the hosted model.",alerts:"Review and export predictions from this demo session.",device:"Connect optional Arduino hardware for physical alerts."})[page]}</p></div>
        <div className="top-actions"><span className={health ? "status-pill online" : "status-pill offline"}><i/> {health ? "Cloud backend online" : "Connecting to cloud"}</span><span className={modelHealth?.status === "ok" ? "status-pill online" : "status-pill offline"}><i/> {modelHealth?.status === "ok" ? "ML service online" : "ML service unavailable"}</span><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div>
      </header>

      {page === "overview" && <>
      {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
      <div className="demo-banner">
        <div><b>Quick demo · CIC-IoT-2023 ML samples</b><span>Choose one button to send a preloaded benchmark sample to the hosted LightGBM model. No Arduino, terminal, or local network setup is required. Samples 0–4 are labelled benign; samples 5–9 are labelled attack. This is benchmark inference, not live network monitoring.</span></div>
        <div className="demo-buttons">
          <button disabled={mlBusy} onClick={() => runMLDemo(0)} className="btn subtle">{mlBusy ? "Running…" : "Simulate normal traffic"}</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(5)} className="btn danger">{mlBusy ? "Running…" : "Simulate attack"}</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(8)} className="btn warning">Try another attack</button>
        </div>
        <div className="hardware-demo">
          <b>Arduino LED pattern test · manual demo playback</b>
          <span>These controls test physical LED patterns directly; they are separate from model predictions.</span>
          <div className="demo-buttons">
            {[
              {command:"N", label:"Normal · green"},
              {command:"DOS", label:"DoS · 1 blink"},
              {command:"DDOS", label:"DDoS · 2 blinks"},
              {command:"SCAN", label:"Port scan · 3 blinks"},
              {command:"BRUTE", label:"Brute force · 4 blinks"},
              {command:"BOTNET", label:"Botnet · 5 blinks"}
            ].map(item => <button key={item.command} className={item.command==="N"?"btn subtle":"btn warning"} onClick={()=>sendHardwareCommand(item.command)}>{item.label}</button>)}
          </div>
          {hardwareStatus && <div className="ml-result"><b>Hardware test status</b><span>{hardwareStatus} This manual LED test does not create an ML detection.</span></div>}
        </div>
        {mlResult && <div className="ml-result"><b>Benchmark label: {mlResult.expected_prediction || "—"}</b><span>Model output: {mlResult.prediction} · Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms</span>{mlResult.test_result === "mismatch" && <span>Model output differs from the benchmark label. The raw result is shown without modification.</span>}{hardwareStatus && <span>{hardwareStatus} This is demo playback, not a confirmed ML detection.</span>}</div>}
      </div>

      <div className="stats-grid">
        <Stat label="Demo activity events" value={alerts.length} hint="ML inferences + LED tests" icon={Activity}/>
        <Stat label="Normal events" value={stats.normal ?? 0} hint="Model-classified benign" icon={ShieldCheck} tone="green"/>
        <Stat label="Suspicious events" value={stats.suspicious ?? 0} hint="Model-classified attack" icon={AlertTriangle} tone="red"/>
        <Stat label="Arduino endpoint" value={deviceConnected ? "Connected" : "Optional"} hint="Not required for cloud demo" icon={Cpu} tone="purple"/>
      </div>

      <div className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Demo activity timeline</h2><p>ML confidence and manual LED test events</p></div><span className="tag">AUTO REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.28}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#203047" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#101d2d", border: "1px solid #263a53", borderRadius: 10, color: "#e6eef8" }}/><Area type="monotone" dataKey="confidence" name="ML confidence" stroke="#36b7a5" strokeWidth={2.5} fill="url(#fillRate)" connectNulls={false} dot={{ r: 5, fill: "#36b7a5", stroke: "#101d2d", strokeWidth: 2 }} activeDot={{ r: 7 }}/>
            <Line type="monotone" dataKey="hardwareSignal" name="Manual LED demo" stroke="#f0a34a" strokeWidth={2} connectNulls={false} dot={{ r: 5 }} activeDot={{ r: 7 }}/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No events yet</b><span>Click a quick demo button above to run your first sample.</span></div>}
        </article>
        <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino LED endpoint</h2><p>Physical two-LED demonstration</p></div><Cpu size={19}/></div>
          <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Telemetry bridge connected" : "Not connected · cloud demo still works"}</span></div>
          <div className="muted-note">The hosted dashboard and ML demo work without Arduino. Connect the board and start the local bridge only when you want to demonstrate physical alerts.</div>
        </article>
      </div>

      <article className="panel table-panel"><div className="panel-heading"><div><h2>Recent activity</h2><p>Latest ML inferences and manual LED test commands.</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
        <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
          {alerts.length ? alerts.slice(0, 8).map((a, i) => <tr key={a.timestamp + i}><td>{new Date(a.timestamp).toLocaleTimeString()}</td><td>{a.display_label || a.model_prediction || a.attack_type || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={predictionLabel(a) === "Attack" ? "event-badge bad" : predictionLabel(a) === "Benign" ? "event-badge good" : "event-badge neutral"}>{predictionLabel(a)}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No detections yet. Run a quick demo sample above.</td></tr>}
        </tbody></table></div>
      </article>
      <footer>SentinelIoT · Educational defensive prototype · Cloud demo uses labelled benchmark samples; live traffic monitoring and Arduino hardware are optional local integrations.</footer>
      </>}
      {page === "lab" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="lab-warning"><AlertTriangle size={18}/><div><b>Attack Lab · synthetic flow inference</b><span>Choose a ready-made scenario. SentinelIoT builds synthetic feature values and sends them to the hosted CIC-IoT-2023 API. These are demonstrations, not packet-captured dataset flows.</span></div></div>
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
        <div className="page-note"><Wifi size={17}/><div><b>What appears in the dashboard?</b><span>Each successful run calls the hosted ML API and records its returned classification. Arduino alerts require the optional local serial bridge; synthetic feature predictions are not validated live-network detections.</span></div></div>
      </>}
      {page === "traffic" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="demo-banner">
          <div><b>Pretrained CIC-IoT-2023 · LightGBM</b><span>Choose a labelled benchmark sample to send to the hosted classifier. This tests inference against the provider's sample dataset; it does not capture live packets from your network.</span></div>
          <div className="demo-buttons">
            <button disabled={mlBusy} onClick={() => runMLDemo(0)} className="btn subtle">Test benign sample</button>
            <button disabled={mlBusy} onClick={() => runMLDemo(5)} className="btn danger">Test attack sample</button>
            <button disabled={mlBusy} onClick={() => runMLDemo(8)} className="btn warning">Test second attack</button>
          </div>
          {mlResult && <div className="ml-result"><b>Benchmark sample class: {mlResult.expected_prediction || "—"}</b><span>Raw model output: {mlResult.prediction} · Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms</span>{mlResult.test_result === "mismatch" && <span>Demo validation note: provider output differs from this sample's benchmark label.</span>}</div>}
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
          <div className="panel-heading"><div><h2>Optional live Wi-Fi capture</h2><p>Advanced local feature · not needed for the demo</p></div><span className="tag">OPTIONAL</span></div>
          <p>To experiment with local packet capture on Windows, install Npcap and Scapy, then run these commands from your cloned repository in PowerShell as Administrator.</p>
          <pre>py -m pip install -r network/requirements.txt{"\n"}py network/live_capture.py --interface Wi-Fi</pre>
          <p>Capture-only mode prints real packet-derived flow summaries. Experimental feature estimates can be submitted with:</p>
          <pre>py network/live_capture.py --interface Wi-Fi --infer --api https://iot-project-avq0.onrender.com</pre>
          <div className="lab-warning"><AlertTriangle size={18}/><div><b>Experimental feature mapping — not validated</b><span>The local agent estimates selected model fields from visible laptop traffic. It does not monitor every device on your Wi-Fi, and outputs should not be treated as confirmed attacks.</span></div></div>
        </div>
      </>}
      {page === "alerts" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="stats-grid">
          <Stat label="Total predictions" value={alerts.length} hint="Current backend session" icon={Activity}/>
          <Stat label="Attack alerts" value={alerts.filter(x=>x.status==="suspicious").length} hint="Classified by ML model" icon={ShieldAlert} tone="red"/>
          <Stat label="Benign samples" value={alerts.filter(x=>x.status==="normal").length} hint="Classified by ML model" icon={ShieldCheck} tone="green"/>
          <Stat label="Detection engine" value="LightGBM" hint="Hosted CIC-IoT-2023 model" icon={Cpu} tone="purple"/>
        </div>
        <article className="panel table-panel"><div className="panel-heading"><div><h2>Detection history</h2><p>ML-generated predictions received by SentinelIoT</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
          <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
            {alerts.length ? alerts.map((a,i)=><tr key={a.timestamp+i}><td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.model_prediction || a.attack_type || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence*100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={predictionLabel(a)==="Attack"?"event-badge bad":predictionLabel(a)==="Benign"?"event-badge good":"event-badge neutral"}>{predictionLabel(a)}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No ML alerts yet. Run a sample from Overview.</td></tr>}
          </tbody></table></div>
        </article>
      </>}
      {page === "device" && <>
        <div className="content-grid">
          <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino Uno status</h2><p>Optional USB serial hardware bridge</p></div><Cpu size={19}/></div>
            <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Local USB bridge connected" : "Not connected · cloud demo still works"}</span></div>
            <div className="device-meta"><span>Backend status</span><b>{health?.status || "Unknown"}</b></div>
            <div className="device-meta"><span>Device telemetry</span><b>{deviceConnected ? "Receiving live telemetry" : "Telemetry stale / not received"}</b></div>
            <div className="device-meta"><span>Device ID</span><b>{deviceTelemetry?.device_id || "—"}</b></div>
            <div className="device-meta"><span>Uptime</span><b>{deviceTelemetry?.uptime_ms != null ? `${Math.floor(deviceTelemetry.uptime_ms / 1000)} sec` : "—"}</b></div>
            <div className="device-meta"><span>Board LED</span><b>{deviceTelemetry?.led_state || "—"}</b></div>
            <div className="device-meta"><span>Last received</span><b>{deviceTelemetry?.received_at ? new Date(deviceTelemetry.received_at).toLocaleTimeString() : "—"}</b></div>
            <div className="device-meta"><span>Serial protocol</span><b>USB · 9600 baud</b></div>
            <div className="muted-note">The hosted dashboard does not need access to your laptop USB port. Start the local Python bridge only when demonstrating physical Arduino alerts.</div>
          </article>
          <article className="panel"><div className="panel-heading"><div><h2>Optional hardware setup</h2><p>Three-step local connection</p></div><span className="tag">OPTIONAL</span></div>
            <div className="architecture-step"><span>01</span><div><b>Connect Arduino Uno</b><small>Upload the SentinelIoT firmware and connect it by USB.</small></div></div>
            <div className="architecture-step"><span>02</span><div><b>Start the local bridge</b><small>Run start_sentineliot.bat on the laptop connected to the board.</small></div></div>
            <div className="architecture-step"><span>03</span><div><b>Demonstrate physical alerts</b><small>Use the Overview LED pattern controls to test the two physical LEDs.</small></div></div>
          </article>
        </div>
        <div className="page-note"><AlertTriangle size={17}/><div><b>Hardware is optional</b><span>Cloud benchmark demonstrations work without the local bridge. Render cannot access a USB Arduino attached to your laptop.</span></div></div>
      </>}
    </section>
  </main>;
}
