import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Cpu, Download, Radio, RefreshCw, ShieldCheck, ShieldAlert, Wifi, FlaskConical, Copy, Check } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

function predictionLabel(event) {
  const value = String(event?.model_prediction || event?.attack_type || event?.prediction || "").trim().toLowerCase();
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
  const [deviceTelemetry, setDeviceTelemetry] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ events: 0, normal: 0, suspicious: 0 });
  const [error, setError] = useState("");
  const [mlBusy, setMlBusy] = useState(false);
  const [mlResult, setMlResult] = useState(null);
  const [copiedScenario, setCopiedScenario] = useState("");
  const [labBusy, setLabBusy] = useState("");
  const [labResult, setLabResult] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const [h, a, s, d] = await Promise.all([
        fetch(`${API}/health`), fetch(`${API}/alerts`), fetch(`${API}/stats`), fetch(`${API}/device/telemetry`)
      ]);
      if (!h.ok || !a.ok || !s.ok || !d.ok) throw new Error("API returned an error");
      setHealth(await h.json()); setAlerts(await a.json()); setStats(await s.json()); setDeviceTelemetry(await d.json()); setError("");
    } catch {
      setHealth(null); setError("Backend unavailable. Start FastAPI at 127.0.0.1:8000.");
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 2500);
    return () => clearInterval(timer);
  }, [refresh]);

  async function runMLDemo(sampleIdx) {
    setMlBusy(true); setError("");
    try {
      const response = await fetch(`${API}/ml/demo/${sampleIdx}?model=lightgbm`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Pretrained model request failed");
      setMlResult(data.inference);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setMlBusy(false); }
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
      setLabResult(data); await refresh();
    } catch (e) { setError(e.message); }
    finally { setLabBusy(""); }
  }

  const deviceConnected = Boolean(deviceTelemetry?.connected && deviceTelemetry?.received_at && Date.now() - Date.parse(deviceTelemetry.received_at) < 10000);

  const chartData = useMemo(() => [...alerts].slice(0, 12).reverse().map((x, i) => ({
    name: new Date(x.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    confidence: Math.round((x.confidence || 0) * 100)
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
      <div className="sidebar-bottom"><div className="live-dot"/> Local monitoring mode <small>Prototype v0.1</small></div>
    </aside>

    <section className="main">
      <header className="topbar"><div><div className="eyebrow">SECURITY OPERATIONS CENTER / {page.toUpperCase()}</div><h1>{({overview:"Network security overview",traffic:"Traffic monitor",lab:"Attack Lab",alerts:"Threat alerts",device:"Device endpoint"})[page]}</h1><p>{({overview:"Monitor ML detections and system health.",traffic:"Inspect benchmark inference and run the local Wi-Fi capture agent.",lab:"Generate safe, bounded traffic patterns against a local test service.",alerts:"Review and export suspicious and benign ML predictions.",device:"Check the Arduino bridge status and local hardware setup."})[page]}</p></div>
        <div className="top-actions"><span className={health ? "status-pill online" : "status-pill offline"}><i/> {health ? "API connected" : "API disconnected"}</span><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div>
      </header>

      {page === "overview" && <>
      {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
      <div className="demo-banner">
        <div><b>ML detection · CIC-IoT-2023</b><span>Run preloaded benchmark samples through the hosted LightGBM classifier. Samples 0–4 are benign examples; samples 5–9 are attack examples. This validates model inference, not live network capture.</span></div>
        <div className="demo-buttons">
          <button disabled={mlBusy} onClick={() => runMLDemo(0)} className="btn subtle">Run benign ML sample</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(5)} className="btn danger">Run attack ML sample</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(8)} className="btn warning">Run another attack</button>
        </div>
        {mlResult && <div className="ml-result"><b>Model prediction: {mlResult.prediction}</b><span>Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms · {mlResult.feature_count} features</span></div>}
      </div>

      <div className="stats-grid">
        <Stat label="Events processed" value={stats.events ?? 0} hint="In-memory session history" icon={Activity}/>
        <Stat label="Normal events" value={stats.normal ?? 0} hint="ML-classified benign" icon={ShieldCheck} tone="green"/>
        <Stat label="Suspicious events" value={stats.suspicious ?? 0} hint="ML-classified attack" icon={AlertTriangle} tone="red"/>
        <Stat label="Arduino endpoint" value={deviceConnected ? "Connected" : "Not connected"} hint="USB serial bridge" icon={Cpu} tone="purple"/>
      </div>

      <div className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>ML confidence trend</h2><p>Prediction confidence · recent model inferences</p></div><span className="tag">LIVE REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.28}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#203047" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#101d2d", border: "1px solid #263a53", borderRadius: 10, color: "#e6eef8" }}/><Area type="monotone" dataKey="confidence" stroke="#36b7a5" strokeWidth={2.5} fill="url(#fillRate)"/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No events yet</b><span>Run an ML sample above to populate the chart.</span></div>}
        </article>
        <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino endpoint</h2><p>USB-connected physical response</p></div><Cpu size={19}/></div>
          <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Telemetry bridge connected" : "Waiting for local bridge telemetry"}</span></div>
          <div className="device-meta"><span>Protocol</span><b>USB Serial · 9600 baud</b></div><div className="device-meta"><span>Alert command</span><b>A = LED ON · N = LED OFF</b></div>
          <div className="muted-note">Run the local device_agent.py bridge on the laptop connected to the Arduino. The dashboard marks it connected while telemetry is received (within the last 10 seconds).</div>
        </article>
      </div>

      <article className="panel table-panel"><div className="panel-heading"><div><h2>Recent ML detections</h2><p>Latest activity detected by the SentinelIoT engine.</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
        <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
          {alerts.length ? alerts.slice(0, 8).map((a, i) => <tr key={a.timestamp + i}><td>{new Date(a.timestamp).toLocaleTimeString()}</td><td>{a.model_prediction || a.attack_type || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={predictionLabel(a) === "Attack" ? "event-badge bad" : predictionLabel(a) === "Benign" ? "event-badge good" : "event-badge neutral"}>{predictionLabel(a)}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No detection events recorded yet.</td></tr>}
        </tbody></table></div>
      </article>
      <footer>SentinelIoT · Educational defensive prototype · Benchmark samples are sent to the pretrained ML model; live traffic capture is not enabled yet.</footer>
      </>}
      {page === "lab" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="lab-warning"><AlertTriangle size={18}/><div><b>Cloud Attack Lab · synthetic flow inference</b><span>Choose a bounded scenario. SentinelIoT derives the model's 20 named input fields from a synthetic HTTP profile and sends them to the hosted CIC-IoT-2023 API. These are approximations, not packet-captured dataset flows.</span></div></div>
        <div className="lab-grid">
          {[
            {id:"normal",title:"Normal activity",kind:"Baseline",desc:"15 spaced HTTP-like events with modest payload sizes.",tone:"good"},
            {id:"burst",title:"Request burst",kind:"Traffic anomaly",desc:"25 closely spaced events to model a short request burst.",tone:"warn"},
            {id:"failed_requests",title:"Repeated failed paths",kind:"Error pattern",desc:"10 events representing repeated HTTP 404 responses.",tone:"warn"},
            {id:"large_payload",title:"Large request body",kind:"Payload test",desc:"One event with an approximately 4 KB request body.",tone:"blue"}
          ].map(item=><article className="panel lab-card" key={item.id}>
            <div className="lab-card-top"><span className={`lab-kind ${item.tone}`}>{item.kind}</span><span className="lab-local">CLOUD INFERENCE</span></div>
            <h3>{item.title}</h3><p>{item.desc}</p>
            <button className={item.tone==="warn"?"btn danger":"btn subtle"} disabled={!!labBusy} onClick={()=>runLabScenario(item.id)}>{labBusy===item.id?"Running model…":"Run scenario + ML inference"}</button>
          </article>)}
        </div>
        {labResult && <article className="panel table-panel">
          <div className="panel-heading"><div><h2>Scenario inference result</h2><p>{labResult.scenario} · hosted LightGBM</p></div><span className="tag">20 FEATURES SENT</span></div>
          <div className="ml-result"><b>Model prediction: {labResult.sentinel_event?.model_prediction || labResult.inference?.prediction}</b><span>Expected: {labResult.sentinel_event?.expected_prediction || "—"} · Test result: {labResult.sentinel_event?.test_result || "not comparable"} · Confidence: {Math.round((labResult.inference?.confidence || 0)*100)}%</span></div>
          {labResult.sentinel_event?.test_result === "mismatch" && <div className="lab-warning"><AlertTriangle size={18}/><div><b>Expected result and model prediction differ</b><span>This is a synthetic test mismatch, not proof of a real network attack. It will not trigger the Arduino alarm.</span></div></div>}
          <p className="lab-hint">{labResult.feature_note}</p>
          <details><summary>View the 20 submitted features</summary><pre>{JSON.stringify(labResult.features,null,2)}</pre></details>
        </article>}
        <div className="page-note"><Wifi size={17}/><div><b>What appears in the dashboard?</b><span>Each successful run now calls the hosted ML API and records its returned classification in Overview, Traffic monitor and Threat alerts. Arduino alerts require the local serial bridge; synthetic feature predictions are experimental and not validated live-network detections.</span></div></div>
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
          {mlResult && <div className="ml-result"><b>Prediction: {mlResult.prediction}</b><span>Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms · {mlResult.feature_count} features</span></div>}
        </div>
        <div className="stats-grid">
          <Stat label="Samples processed" value={stats.events ?? 0} hint="Since last backend restart" icon={Activity}/>
          <Stat label="Benign predictions" value={stats.normal ?? 0} hint="Model classified as benign" icon={ShieldCheck} tone="green"/>
          <Stat label="Attack predictions" value={stats.suspicious ?? 0} hint="Model classified as attack" icon={AlertTriangle} tone="red"/>
          <Stat label="Inference model" value="LightGBM" hint="Hosted CIC-IoT-2023" icon={Cpu} tone="purple"/>
        </div>
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Prediction confidence</h2><p>Confidence percentage for recent ML samples</p></div><span className="tag">AUTO REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={270}><AreaChart data={chartData}><defs><linearGradient id="trafficConfidence" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.24}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#e8edf4" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{fill:"#8292a8",fontSize:11}} axisLine={false} tickLine={false}/><YAxis domain={[0,100]} tickFormatter={v=>`${v}%`} tick={{fill:"#8292a8",fontSize:11}} axisLine={false} tickLine={false}/><Tooltip/><Area type="monotone" dataKey="confidence" stroke="#269d8a" strokeWidth={2.5} fill="url(#trafficConfidence)"/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No ML samples yet</b><span>Run a sample to see its confidence here.</span></div>}
        </article>
        <div className="panel table-panel">
          <div className="panel-heading"><div><h2>Live Wi-Fi capture · Windows</h2><p>Run this local agent from your cloned repository</p></div><span className="tag">LOCAL AGENT</span></div>
          <p>Install Npcap and Scapy, then open PowerShell as Administrator in your project folder.</p>
          <pre>py -m pip install -r network/requirements.txt{"\n"}py network/live_capture.py --interface Wi-Fi</pre>
          <p>Capture-only mode prints real packet-derived flow summaries and does not call the ML model. To submit experimental feature estimates:</p>
          <pre>py network/live_capture.py --interface Wi-Fi --infer --api https://iot-project-avq0.onrender.com</pre>
          <div className="lab-warning"><AlertTriangle size={18}/><div><b>Experimental feature mapping — not validated</b><span>The local agent groups your laptop's visible Wi-Fi traffic into 10-second flows and estimates the model's 20 selected fields. Some CIC-IoT-2023 feature definitions may differ from these estimates. Treat model outputs as experiments, not confirmed attacks. It does not monitor other devices on your Wi-Fi.</span></div></div>
        </div>
      </>}
      {page === "alerts" && <>
        {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
        <div className="stats-grid">
          <Stat label="Total predictions" value={alerts.length} hint="Stored in current backend session" icon={Activity}/>
          <Stat label="Attack alerts" value={alerts.filter(x=>x.status==="suspicious").length} hint="Classified by ML model" icon={ShieldAlert} tone="red"/>
          <Stat label="Benign samples" value={alerts.filter(x=>x.status==="normal").length} hint="Classified by ML model" icon={ShieldCheck} tone="green"/>
          <Stat label="Detection engine" value="LightGBM" hint="CIC-IoT-2023 model" icon={Cpu} tone="purple"/>
        </div>
        <article className="panel table-panel"><div className="panel-heading"><div><h2>Detection history</h2><p>ML-generated predictions received by SentinelIoT</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
          <div className="table-wrap"><table><thead><tr><th>TIME</th><th>DETECTION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
            {alerts.length ? alerts.map((a,i)=><tr key={a.timestamp+i}><td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.model_prediction || a.attack_type || a.scenario || "Unclassified"}</td><td>{a.confidence != null ? `${Math.round(a.confidence*100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={predictionLabel(a)==="Attack"?"event-badge bad":predictionLabel(a)==="Benign"?"event-badge good":"event-badge neutral"}>{predictionLabel(a)}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No ML alerts yet. Run a sample from Traffic monitor.</td></tr>}
          </tbody></table></div>
        </article>
      </>}
      {page === "device" && <>
        <div className="content-grid">
          <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino Uno status</h2><p>USB serial hardware bridge</p></div><Cpu size={19}/></div>
            <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{deviceConnected ? "Local USB bridge connected" : "Waiting for local bridge telemetry"}</span></div>
            <div className="device-meta"><span>Backend status</span><b>{health?.status || "Unknown"}</b></div>
            <div className="device-meta"><span>Device telemetry</span><b>{deviceConnected ? "Receiving live telemetry" : "Telemetry stale / not received"}</b></div>
            <div className="device-meta"><span>Device ID</span><b>{deviceTelemetry?.device_id || "—"}</b></div>
            <div className="device-meta"><span>Uptime</span><b>{deviceTelemetry?.uptime_ms != null ? `${Math.floor(deviceTelemetry.uptime_ms / 1000)} sec` : "—"}</b></div>
            <div className="device-meta"><span>Board LED</span><b>{deviceTelemetry?.led_state || "—"}</b></div>
            <div className="device-meta"><span>Last received</span><b>{deviceTelemetry?.received_at ? new Date(deviceTelemetry.received_at).toLocaleTimeString() : "—"}</b></div>
            <div className="device-meta"><span>Serial protocol</span><b>USB · 9600 baud</b></div>
            <div className="device-meta"><span>Alert commands</span><b>A = LED ON · N = LED OFF</b></div>
            <div className="muted-note">Render runs remotely and cannot access a USB Arduino attached to your laptop. A local Python agent is required to relay ML alerts to the board.</div>
          </article>
          <article className="panel"><div className="panel-heading"><div><h2>Connection architecture</h2><p>How the hardware bridge will work</p></div><span className="tag">NEXT INTEGRATION</span></div>
            <div className="architecture-step"><span>01</span><div><b>Cloud ML backend</b><small>Runs LightGBM inference and creates an alert.</small></div></div>
            <div className="architecture-step"><span>02</span><div><b>Local Python agent</b><small>Polls for new alerts and writes serial commands.</small></div></div>
            <div className="architecture-step"><span>03</span><div><b>Arduino Uno</b><small>Receives A or N and changes the LED state.</small></div></div>
          </article>
        </div>
        <div className="page-note"><AlertTriangle size={17}/><div><b>Local hardware bridge status</b><span>The dashboard uses recent telemetry from your local Python bridge. Keep device_agent.py running on the laptop connected to the Arduino; Render cannot access that laptop USB port.</span></div></div>
      </>}

    </section>
  </main>;
}
