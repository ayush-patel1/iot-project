import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Cpu, Download, Radio, RefreshCw, ShieldCheck, ShieldAlert, Wifi } from "lucide-react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function Stat({ label, value, hint, icon: Icon, tone = "blue" }) {
  return <article className="stat-card">
    <div className="stat-top"><span>{label}</span><span className={`icon-wrap ${tone}`}><Icon size={18}/></span></div>
    <strong>{value}</strong><small>{hint}</small>
  </article>;
}

export default function App() {
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState({ events: 0, normal: 0, suspicious: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mlBusy, setMlBusy] = useState(false);
  const [mlResult, setMlResult] = useState(null);

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

  async function runScenario(scenario) {
    setBusy(true);
    try {
      const packetCount = scenario === "normal" ? 4 : scenario === "burst" ? 35 : scenario === "failed_requests" ? 12 : 2;
      const byteCount = scenario === "large_payload" ? 4096 : packetCount * 180;
      const duration = scenario === "normal" ? 8 : scenario === "burst" ? 2 : 4;
      const response = await fetch(`${API}/demo/analyze`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario, packet_count: packetCount, byte_count: byteCount, duration_seconds: duration })
      });
      if (!response.ok) throw new Error("Scenario request failed");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

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
    rate: x.packet_rate || 0
  })), [alerts]);

  function exportAlerts() {
    const blob = new Blob([JSON.stringify(alerts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = "sentineliot-alerts.json"; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={23}/></div><div><b>SENTINEL<span>IoT</span></b><small>THREAT MONITOR</small></div></div>
      <div className="side-label">WORKSPACE</div>
      <div className="nav-item active"><Activity size={17}/> Overview</div>
      <div className="nav-item"><Radio size={17}/> Traffic monitor</div>
      <div className="nav-item"><ShieldAlert size={17}/> Threat alerts</div>
      <div className="nav-item"><Cpu size={17}/> Device endpoint</div>
      <div className="sidebar-bottom"><div className="live-dot"/> Local monitoring mode <small>Prototype v0.1</small></div>
    </aside>

    <section className="main">
      <header className="topbar"><div><div className="eyebrow">SECURITY OPERATIONS CENTER / OVERVIEW</div><h1>Network security overview</h1><p>Monitor traffic patterns, inspect alerts and test the Arduino response.</p></div>
        <div className="top-actions"><span className={health ? "status-pill online" : "status-pill offline"}><i/> {health ? "API connected" : "API disconnected"}</span><button className="icon-button" onClick={refresh} title="Refresh"><RefreshCw size={17}/></button></div>
      </header>

      {error && <div className="notice"><AlertTriangle size={17}/>{error}</div>}
      <div className="demo-banner"><div><b>Controlled demo console</b><span>Generate test events locally. These rule-based events are not ML classifications.</span></div>
        <div className="demo-buttons">
          <button disabled={busy} onClick={() => runScenario("normal")} className="btn subtle">Normal traffic</button>
          <button disabled={busy} onClick={() => runScenario("burst")} className="btn warning">Traffic burst</button>
          <button disabled={busy} onClick={() => runScenario("failed_requests")} className="btn danger">Failed requests</button>
          <button disabled={busy} onClick={() => runScenario("large_payload")} className="btn subtle">Large payload</button>
        </div>
      </div>

      <div className="demo-banner">
        <div><b>Pretrained CIC-IoT-2023 model</b><span>Calls the hosted LightGBM classifier with its preloaded benchmark samples. Samples 0–4 are benign; 5–9 are attack examples.</span></div>
        <div className="demo-buttons">
          <button disabled={mlBusy} onClick={() => runMLDemo(0)} className="btn subtle">Run benign ML sample</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(5)} className="btn danger">Run attack ML sample</button>
          <button disabled={mlBusy} onClick={() => runMLDemo(8)} className="btn warning">Run another attack</button>
        </div>
        {mlResult && <div className="ml-result"><b>Model prediction: {mlResult.prediction}</b><span>Confidence: {Math.round((mlResult.confidence || 0) * 100)}% · {mlResult.model} · {mlResult.latency_ms} ms · {mlResult.feature_count} features</span></div>}
      </div>

      <div className="stats-grid">
        <Stat label="Events processed" value={stats.events ?? 0} hint="In-memory session history" icon={Activity}/>
        <Stat label="Normal events" value={stats.normal ?? 0} hint="Rule-based normal" icon={ShieldCheck} tone="green"/>
        <Stat label="Suspicious events" value={stats.suspicious ?? 0} hint="Requires investigation" icon={AlertTriangle} tone="red"/>
        <Stat label="Arduino endpoint" value={health?.arduino_connected ? "Connected" : "Not connected"} hint="USB serial bridge" icon={Cpu} tone="purple"/>
      </div>

      <div className="content-grid">
        <article className="panel chart-panel"><div className="panel-heading"><div><h2>Traffic event rate</h2><p>Packets per second · recent demo events</p></div><span className="tag">LIVE REFRESH</span></div>
          {chartData.length ? <ResponsiveContainer width="100%" height={245}><AreaChart data={chartData}><defs><linearGradient id="fillRate" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#36b7a5" stopOpacity={0.28}/><stop offset="95%" stopColor="#36b7a5" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#203047" strokeDasharray="4 4" vertical={false}/><XAxis dataKey="name" tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: "#8292a8", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip contentStyle={{ background: "#101d2d", border: "1px solid #263a53", borderRadius: 10, color: "#e6eef8" }}/><Area type="monotone" dataKey="rate" stroke="#36b7a5" strokeWidth={2.5} fill="url(#fillRate)"/></AreaChart></ResponsiveContainer> : <div className="empty-chart"><Activity size={25}/><b>No events yet</b><span>Run a scenario above to populate the chart.</span></div>}
        </article>
        <article className="panel endpoint-panel"><div className="panel-heading"><div><h2>Arduino endpoint</h2><p>USB-connected physical response</p></div><Cpu size={19}/></div>
          <div className="device-visual"><div className="device-orb"><Cpu size={34}/></div><b>Arduino Uno</b><span>{health?.arduino_connected ? "Serial connection active" : "Waiting for serial connection"}</span></div>
          <div className="device-meta"><span>Protocol</span><b>USB Serial · 9600 baud</b></div><div className="device-meta"><span>Alert command</span><b>A = LED ON · N = LED OFF</b></div>
          <div className="muted-note">Connect the board and set ARDUINO_PORT in your environment to enable hardware alerts.</div>
        </article>
      </div>

      <article className="panel table-panel"><div className="panel-heading"><div><h2>Recent detection events</h2><p>Latest rule-based and pretrained-model results</p></div><button className="btn subtle" onClick={exportAlerts} disabled={!alerts.length}><Download size={14}/> Export JSON</button></div>
        <div className="table-wrap"><table><thead><tr><th>TIME</th><th>SCENARIO</th><th>PACKETS</th><th>RATE</th><th>DETECTOR</th><th>STATUS</th></tr></thead><tbody>
          {alerts.length ? alerts.slice(0, 8).map((a, i) => <tr key={a.timestamp + i}><td>{new Date(a.timestamp).toLocaleTimeString()}</td><td>{a.scenario}</td><td>{a.packet_count ?? "—"}</td><td>{a.packet_rate != null ? `${a.packet_rate} pkt/s` : "—"}</td><td><span className="detector">{a.detector || "demo-rule"}</span></td><td><span className={a.status === "suspicious" ? "event-badge bad" : "event-badge good"}>{a.status}</span></td></tr>) : <tr><td colSpan="6" className="empty-row">No detection events recorded yet.</td></tr>}
        </tbody></table></div>
      </article>
      <footer>SentinelIoT · Educational defensive prototype · No external network traffic is generated by the demo controls.</footer>
    </section>
  </main>;
}
