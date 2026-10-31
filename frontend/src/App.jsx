import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, Cpu, Download, Radio, RefreshCw, ShieldCheck, ShieldAlert, Wifi, FlaskConical, Copy, Check } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

function Stat({ label, value, hint, icon: Icon, tone = "blue" }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className={`icon-wrap ${tone}`}><Icon size={18}/></span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}

export default function App() {
  const [page, setPage] = useState("overview");
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ events: 0, normal: 0, suspicious: 0 });
  const [error, setError] = useState("");
  const [mlBusy, setMlBusy] = useState(false);
  const [mlResult, setMlResult] = useState(null);
  const [copiedScenario, setCopiedScenario] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [h, a, s] = await Promise.all([
        fetch(`${API}/health`), fetch(`${API}/alerts`), fetch(`${API}/stats`)
      ]);
      if (!h.ok || !a.ok || !s.ok) throw new Error("API returned an error");
      setHealth(await h.json()); setAlerts(await a.json()); setStats(await s.json()); setError("");
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
      <header className="topbar"><div><div className="eyebrow">SECURITY OPERATIONS CENTER / {page.toUpperCase()}</div><h1>{({overview:"Network security overview",traffic:"Traffic monitor",lab:"Attack Lab",alerts:"Threat alerts",device:"Device endpoint"})[page]}</h1><p>{({overview:"Monitor ML detections and system health.",traffic:"Inspect benchmark inference activity and test the pretrained model.",lab:"Generate safe, bounded traffic patterns against a local test service.",alerts:"Review and export suspicious and benign ML predictions.",device:"Check the Arduino bridge status and local hardware setup."})[page]}</p></div>
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
        <Stat label="Arduino endpoint" value={health?.arduino_connected ? "Connected" : "Not connected"} hint="USB serial bridge" icon={Cpu} tone="purple"/>
      </div>

      <div className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>ML confidence trend</h2><p>Prediction confidence · recent model inferences</p></div><span className="tag">LIVE REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.28}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#203047" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#101d2d", border: "1px solid #263a53", borderRadius: 10, color: "#e6eef8" }}/><Area type="monotone" dataKey="confidence" stroke="#36b7a5" strokeWidth={2.5} fill="url(#fillRate)"/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No events yet</b><span>Run an ML sample above to populate the chart.</span></div>}
        </article>
        <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino endpoint</h2><p>USB-connected physical response</p></div><Cpu size={19}/></div>
          <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{health?.arduino_connected ? "Serial connection active" : "Waiting for serial connection"}</span></div>
          <div className="device-meta"><span>Protocol</span><b>USB Serial · 9600 baud</b></div><div className="device-meta"><span>Alert command</span><b>A = LED ON · N = LED OFF</b></div>
          <div className="muted-note">Connect the board and set ARDUINO_PORT in your environment to enable hardware alerts.</div>
        </article>
      </div>

      <article className="panel table-panel"><div className="panel-heading"><div><h2>Recent ML detections</h2><p>Latest pretrained model predictions</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
        <div className="table-wrap"><table><thead><tr><th>TIME</th><th>PREDICTION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
          {alerts.length ? alerts.slice(0, 8).map((a, i) => <tr key={a.timestamp + i}><td>{new Date(a.timestamp).toLocaleTimeString()}</td><td>{a.attack_type || a.scenario}</td><td>{a.confidence != null ? `${Math.round(a.confidence * 100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={a.status === "suspicious" ? "event-badge bad" : "event-badge good"}>{a.status}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No detection events recorded yet.</td></tr>}
        </tbody></table></div>
      </article>
      <footer>SentinelIoT · Educational defensive prototype · Benchmark samples are sent to the pretrained ML model; live traffic capture is not enabled yet.</footer>
      </>}
      {page === "lab" && <>
        <div className="lab-warning"><AlertTriangle size={18}/><div><b>Local-only simulation · Not a real network attack</b><span>These scenarios send a small, bounded number of HTTP requests to 127.0.0.1:5001 on your own laptop. They do not perform DDoS, credential guessing, port scanning, or target external devices.</span></div></div>
        <div className="lab-setup panel">
          <div className="panel-heading"><div><h2>Before running a scenario</h2><p>Open two terminals in the project root folder.</p></div><span className="tag">ONE-TIME SETUP</span></div>
          <div className="lab-terminal"><span>TERMINAL 1 · LOCAL TEST SERVER</span><code>pip install -r network/requirements.txt</code><code>python network/local_server.py</code></div>
          <div className="lab-terminal"><span>TERMINAL 2 · RUN A SCENARIO</span><code>python network/traffic_generator.py --scenario normal</code></div>
          <p className="lab-hint">Keep Terminal 1 running. Run one scenario at a time in Terminal 2. Press <kbd>Ctrl</kbd> + <kbd>C</kbd> to stop the server or an ongoing run.</p>
        </div>
        <div className="lab-grid">
          {[
            {id:"normal",title:"Normal activity",kind:"Baseline",desc:"15 spaced requests to local health and device endpoints.",command:"python network/traffic_generator.py --scenario normal",tone:"good"},
            {id:"burst",title:"Request burst",kind:"Traffic anomaly",desc:"25 quick requests to the local health endpoint. This is a small burst, not a DoS test.",command:"python network/traffic_generator.py --scenario burst",tone:"warn"},
            {id:"failed_requests",title:"Repeated failed paths",kind:"Error pattern",desc:"10 requests to deliberately missing local paths that return HTTP 404.",command:"python network/traffic_generator.py --scenario failed_requests",tone:"warn"},
            {id:"large_payload",title:"Large request body",kind:"Payload test",desc:"One 4 KB JSON payload sent to the local echo endpoint.",command:"python network/traffic_generator.py --scenario large_payload",tone:"blue"}
          ].map(item=><article className="panel lab-card" key={item.id}>
            <div className="lab-card-top"><span className={`lab-kind ${item.tone}`}>{item.kind}</span><span className="lab-local">127.0.0.1 only</span></div>
            <h3>{item.title}</h3><p>{item.desc}</p>
            <code className="lab-command">{item.command}</code>
            <button className="btn subtle lab-copy" onClick={()=>copyCommand(item.id)}>{copiedScenario===item.id?<Check size={14}/>:<Copy size={14}/>} {copiedScenario===item.id?"Copied":"Copy command"}</button>
          </article>)}
        </div>
        <div className="page-note"><Wifi size={17}/><div><b>What appears in the dashboard?</b><span>These scripts currently generate localhost HTTP traffic only. They do not yet create CIC-IoT-2023's 20 flow features, so they will not automatically appear as ML predictions or trigger Arduino alerts. The hosted ML sample buttons remain the verified model-inference demo until the feature adapter is implemented.</span></div></div>
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
        <div className="page-note"><Wifi size={17}/><div><b>Live packet capture is not connected yet</b><span>The current traffic monitor displays model inference results from preloaded CIC-IoT-2023 examples. The next integration is a local packet-capture and flow-feature agent.</span></div></div>
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
          <div className="table-wrap"><table><thead><tr><th>TIME</th><th>CLASSIFICATION</th><th>CONFIDENCE</th><th>MODEL</th><th>LATENCY</th><th>STATUS</th></tr></thead><tbody>
            {alerts.length ? alerts.map((a,i)=><tr key={a.timestamp+i}><td>{new Date(a.timestamp).toLocaleString()}</td><td>{a.attack_type || a.scenario}</td><td>{a.confidence != null ? `${Math.round(a.confidence*100)}%` : "—"}</td><td><span className="detector">{a.model || "—"}</span></td><td>{a.latency_ms != null ? `${a.latency_ms} ms` : "—"}</td><td><span className={a.status==="suspicious"?"event-badge bad":"event-badge good"}>{a.status}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No ML alerts yet. Run a sample from Traffic monitor.</td></tr>}
          </tbody></table></div>
        </article>
      </>}
      {page === "device" && <>
        <div className="content-grid">
          <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino Uno status</h2><p>USB serial hardware bridge</p></div><Cpu size={19}/></div>
            <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{health?.arduino_connected ? "Serial connection active" : "Not connected to hosted backend"}</span></div>
            <div className="device-meta"><span>Backend status</span><b>{health?.status || "Unknown"}</b></div>
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
        <div className="page-note"><AlertTriangle size={17}/><div><b>Hardware is not remotely connected yet</b><span>Do not set ARDUINO_PORT on Render for a board plugged into your personal laptop. The serial process must run locally on that same laptop.</span></div></div>
      </>}

    </section>
  </main>;
}
