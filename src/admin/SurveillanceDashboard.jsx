import { useEffect, useRef, useState, useCallback } from "react";

const CAMERAS = [
  { id: "CAM-01", zone: "Kitchen Zone", color: "#1a1a2e", accent: "#16213e", persons: 3, status: "safe" },
  { id: "CAM-02", zone: "Packing Zone", color: "#16213e", accent: "#0f3460", persons: 2, status: "safe" },
  { id: "CAM-03", zone: "Delivery Zone", color: "#1a1a2e", accent: "#1a1a2e", persons: 1, status: "safe" },
  { id: "CAM-04", zone: "Storage Area", color: "#1c0a00", accent: "#3d0000", persons: 1, status: "alert" },
  { id: "CAM-05", zone: "Back-of-House", color: "#0d1117", accent: "#161b22", persons: 4, status: "safe" },
  { id: "CAM-06", zone: "Counter Area", color: "#1a1a2e", accent: "#16213e", persons: 2, status: "warning" },
];

const INCIDENTS = [
  { id: 1, time: "8:03 PM", cam: "CAM-04", zone: "Storage Area", msg: "Unauthorized Basmati Rice movement detected", severity: "critical", conf: 91 },
  { id: 2, time: "7:51 PM", cam: "CAM-06", zone: "Counter Area", msg: "Restricted zone access — Chicken Dum Biryani delivery", severity: "warning", conf: 84 },
  { id: 3, time: "7:42 PM", cam: "CAM-02", zone: "Packing Zone", msg: "Congestion detected — 4+ persons at Biryani station", severity: "warning", conf: 78 },
  { id: 4, time: "7:21 PM", cam: "CAM-01", zone: "Kitchen Zone", msg: "Hygiene compliance — no gloves detected at Tandoor", severity: "info", conf: 72 },
  { id: 5, time: "6:55 PM", cam: "CAM-04", zone: "Storage Area", msg: "Suspicious Frozen Prawns transfer after hours", severity: "critical", conf: 88 },
  { id: 6, time: "6:30 PM", cam: "CAM-05", zone: "Back-of-House", msg: "Kitchen workflow bottleneck — 15+ Biryani orders pending", severity: "info", conf: 67 },
];

const INSIGHTS = [
  { icon: "📦", text: "Frequent Basmati Rice movement after 6 PM — 3 incidents this week", tag: "Inventory Risk" },
  { icon: "🚧", text: "Biryani Packing efficiency decreased by 12% during dinner rush", tag: "Operations" },
  { icon: "👥", text: "Tandoor zone congestion peaks between 7–9 PM", tag: "Congestion" },
  { icon: "🔍", text: "Cold Storage CAM-04 flagged 5 unusual access events in last 48 hrs", tag: "Security" },
  { icon: "✅", text: "Chicken Dum Biryani delivery compliance: 97% — no violations today", tag: "Compliance" },
];

const ALERT_MSGS = [
  "⚠ Unauthorized Basmati Rice movement detected",
  "⚠ Staff entered restricted Chicken Packing zone",
  "⚠ Suspicious Mutton stock transfer detected",
  "⚠ Hygiene compliance warning — Biryani Prep Zone",
  "⚠ Congestion detected in Biryani packing area",
];

// Simulated CCTV noise canvas
function CctvCanvas({ camId, zoneStatus, isAlert }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);
  const animRef = useRef(null);

  // Stable bounding boxes per camera
  const boxes = useRef(
    Array.from({ length: Math.floor(Math.random() * 2) + 1 }, (_, i) => ({
      x: 0.1 + i * 0.3 + Math.random() * 0.1,
      y: 0.2 + Math.random() * 0.2,
      w: 0.12 + Math.random() * 0.06,
      h: 0.28 + Math.random() * 0.1,
      vx: (Math.random() - 0.5) * 0.001,
      vy: (Math.random() - 0.5) * 0.0005,
      label: ["Staff", "Chef", "Worker", "Delivery"][i % 4],
    }))
  );

  const heatRef = useRef(
    Array.from({ length: 3 }, () => ({
      x: 0.2 + Math.random() * 0.6,
      y: 0.3 + Math.random() * 0.4,
      r: 0.08 + Math.random() * 0.06,
    }))
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let tick = 0;

    const draw = () => {
      const W = canvas.width;
      const H = canvas.height;
      tick++;

      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, W, H);
      if (isAlert) {
        grad.addColorStop(0, "#1c0000");
        grad.addColorStop(1, "#2d0000");
      } else if (zoneStatus === "warning") {
        grad.addColorStop(0, "#1a1200");
        grad.addColorStop(1, "#2a1e00");
      } else {
        grad.addColorStop(0, "#0d1117");
        grad.addColorStop(1, "#161b22");
      }
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      // Scanlines
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0,0,0,0.18)";
        ctx.fillRect(0, y, W, 1);
      }

      // Noise grain
      const imgData = ctx.getImageData(0, 0, W, H);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const n = (Math.random() - 0.5) * 18;
        d[i] += n; d[i + 1] += n; d[i + 2] += n;
      }
      ctx.putImageData(imgData, 0, 0);

      // Heatmap zones
      heatRef.current.forEach((h) => {
        const hx = h.x * W, hy = h.y * H, hr = h.r * W;
        const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr);
        hg.addColorStop(0, "rgba(255,80,0,0.18)");
        hg.addColorStop(1, "rgba(255,80,0,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(hx, hy, hr, 0, Math.PI * 2);
        ctx.fill();
      });

      // Move boxes
      boxes.current.forEach((b) => {
        b.x = Math.max(0.02, Math.min(0.82, b.x + b.vx));
        b.y = Math.max(0.05, Math.min(0.65, b.y + b.vy));
        if (Math.random() < 0.01) b.vx = (Math.random() - 0.5) * 0.001;
        if (Math.random() < 0.01) b.vy = (Math.random() - 0.5) * 0.0005;
      });

      // Bounding boxes
      boxes.current.forEach((b) => {
        const bx = b.x * W, by = b.y * H;
        const bw = b.w * W, bh = b.h * H;
        const color = isAlert ? "#ff4444" : zoneStatus === "warning" ? "#f59e0b" : "#22c55e";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 2]);
        ctx.strokeRect(bx, by, bw, bh);
        ctx.setLineDash([]);

        // Corner brackets
        const cs = 6;
        ctx.lineWidth = 2;
        [
          [bx, by, cs, 0, 0, cs],
          [bx + bw, by, -cs, 0, 0, cs],
          [bx, by + bh, cs, 0, 0, -cs],
          [bx + bw, by + bh, -cs, 0, 0, -cs],
        ].forEach(([x, y, dx1, dy1, dx2, dy2]) => {
          ctx.beginPath();
          ctx.moveTo(x + dx1, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy2 || y + dy1);
          ctx.stroke();
        });

        // Label
        ctx.fillStyle = color;
        ctx.font = "bold 9px monospace";
        ctx.fillText(b.label, bx + 2, by - 3);

        // Confidence
        const conf = isAlert ? "91%" : `${78 + Math.floor(Math.random() * 15)}%`;
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(bx, by - 14, 38, 12);
        ctx.fillStyle = color;
        ctx.fillText(conf, bx + 2, by - 5);
      });

      // Path trail
      ctx.strokeStyle = "rgba(34,197,94,0.3)";
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      if (boxes.current[0]) {
        const b = boxes.current[0];
        ctx.beginPath();
        ctx.moveTo(b.x * W + b.w * W / 2, b.y * H + b.h * H);
        ctx.lineTo(b.x * W + b.w * W / 2 + 15, b.y * H + b.h * H + 20);
        ctx.lineTo(b.x * W + b.w * W / 2 - 8, b.y * H + b.h * H + 40);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Timestamp
      const now = new Date();
      const ts = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(W - 72, H - 18, 70, 16);
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px monospace";
      ctx.fillText(ts, W - 70, H - 6);

      // REC dot
      if (Math.floor(tick / 15) % 2 === 0) {
        ctx.fillStyle = isAlert ? "#ff0000" : "#22c55e";
        ctx.beginPath();
        ctx.arc(8, 8, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Alert flash overlay
      if (isAlert && Math.floor(tick / 20) % 2 === 0) {
        ctx.strokeStyle = "rgba(255,0,0,0.4)";
        ctx.lineWidth = 3;
        ctx.strokeRect(2, 2, W - 4, H - 4);
      }

      animRef.current = requestAnimationFrame(draw);
      frameRef.current = tick;
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [isAlert, zoneStatus]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={180}
      className="w-full h-full object-cover rounded-t-lg"
      style={{ display: "block" }}
    />
  );
}

function CameraCard({ cam, isSelected, onClick, alertActive }) {
  const isAlert = cam.status === "alert" || (alertActive && cam.id === "CAM-04");
  const isWarning = cam.status === "warning";

  return (
    <div
      onClick={onClick}
      className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        border: isAlert
          ? "2px solid #ef4444"
          : isWarning
          ? "2px solid #f59e0b"
          : isSelected
          ? "2px solid #E53935"
          : "1px solid #FFCDD2",
        boxShadow: isAlert
          ? "0 0 20px rgba(239,68,68,0.35)"
          : isWarning
          ? "0 0 12px rgba(245,158,11,0.25)"
          : "none",
        background: "#fff",
      }}
    >
      {/* Feed */}
      <div className="relative" style={{ aspectRatio: "16/9", background: "#0d1117" }}>
        <CctvCanvas camId={cam.id} zoneStatus={cam.status} isAlert={isAlert} />

        {/* Top bar overlay */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-2 py-1.5" style={{ background: "rgba(0,0,0,0.55)" }}>
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: isAlert ? "#ef4444" : "#22c55e" }} />
            <span className="text-white font-mono text-[9px] font-bold tracking-widest">● LIVE — {cam.id}</span>
          </div>
          <span className="text-white/60 font-mono text-[8px]">1080p · 24fps</span>
        </div>

        {/* Status badge */}
        {isAlert && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[9px] font-black tracking-widest animate-pulse"
            style={{ background: "rgba(239,68,68,0.85)", color: "#fff" }}>
            ⚠ ALERT
          </div>
        )}
        {isWarning && !isAlert && (
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded text-[9px] font-black tracking-widest"
            style={{ background: "rgba(245,158,11,0.8)", color: "#fff" }}>
            ⚡ WARNING
          </div>
        )}
      </div>

      {/* Card footer */}
      <div className="px-3 py-2 bg-white flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-gray-800">{cam.id}</p>
          <p className="text-[10px] text-gray-500">{cam.zone}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-medium text-gray-500">👤 {cam.persons}</span>
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
            isAlert ? "bg-red-100 text-red-700" : isWarning ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700"
          }`}>
            {isAlert ? "ALERT" : isWarning ? "WARN" : "SAFE"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function SurveillanceDashboard({ onIncident }) {
  const [selectedCam, setSelectedCam] = useState(0);
  const [alertActive, setAlertActive] = useState(false);
  const [alertMsg, setAlertMsg] = useState("");
  const [incidents, setIncidents] = useState(INCIDENTS);
  const [activeTab, setActiveTab] = useState("grid"); // grid | focus
  const [aiStatus, setAiStatus] = useState("Realtime compliance monitoring active");
  const [popupAlert, setPopupAlert] = useState(null);
  const [zoneFilter, setZoneFilter] = useState("All");

  // Simulate periodic AI alerts
  useEffect(() => {
    const triggerAlert = () => {
      const msg = ALERT_MSGS[Math.floor(Math.random() * ALERT_MSGS.length)];
      const cams = ["CAM-01", "CAM-02", "CAM-04", "CAM-06"];
      const cam = cams[Math.floor(Math.random() * cams.length)];
      const zones = { "CAM-01": "Kitchen Zone", "CAM-02": "Packing Zone", "CAM-04": "Storage Area", "CAM-06": "Counter Area" };
      const now = new Date();
      const timeStr = `${now.getHours()}:${now.getMinutes().toString().padStart(2, "0")} PM`;
      const newIncident = {
        id: Date.now(),
        time: timeStr,
        cam,
        zone: zones[cam],
        msg: msg.replace("⚠ ", ""),
        severity: Math.random() > 0.5 ? "critical" : "warning",
        conf: 70 + Math.floor(Math.random() * 25),
      };

      setAlertActive(true);
      setAlertMsg(msg);
      setPopupAlert(newIncident);
      setAiStatus("⚡ Operational anomaly detected — analyzing...");
      setIncidents((prev) => [newIncident, ...prev.slice(0, 8)]);
      onIncident?.();

      setTimeout(() => {
        setAlertActive(false);
        setAiStatus("AI analyzing operational behavior...");
      }, 5000);
      setTimeout(() => {
        setAiStatus("Realtime compliance monitoring active");
        setPopupAlert(null);
      }, 8000);
    };

    const t1 = setTimeout(triggerAlert, 4000);
    const interval = setInterval(triggerAlert, 28000);
    return () => { clearTimeout(t1); clearInterval(interval); };
  }, []);

  // Cycle AI status messages
  useEffect(() => {
    const msgs = [
      "Realtime compliance monitoring active",
      "AI analyzing operational behavior...",
      "Motion tracking — all zones nominal",
      "Scanning for hygiene compliance...",
      "Cross-referencing inventory movement...",
    ];
    let i = 0;
    const iv = setInterval(() => {
      if (!alertActive) {
        i = (i + 1) % msgs.length;
        setAiStatus(msgs[i]);
      }
    }, 6000);
    return () => clearInterval(iv);
  }, [alertActive]);

  const sevColor = (s) =>
    s === "critical" ? { bg: "#fef2f2", text: "#dc2626", dot: "#ef4444" } :
    s === "warning" ? { bg: "#fffbeb", text: "#d97706", dot: "#f59e0b" } :
    { bg: "#f0fdf4", text: "#16a34a", dot: "#22c55e" };

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="rounded-3xl border border-[#FFCDD2] bg-white p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-[#FFEBEE] flex items-center justify-center text-[#E53935] text-xl shadow-inner">📹</div>
          <div>
            <p className="font-black text-gray-900 tracking-tight">Spire.ai Operational Surveillance</p>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="inline-block h-2 w-2 rounded-full animate-pulse" style={{ background: alertActive ? "#ef4444" : "#22c55e" }} />
              <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: alertActive ? "#dc2626" : "#16a34a" }}>
                {aiStatus}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="hidden sm:flex gap-2">
            <span className="text-[9px] font-black text-[#6B6B6B] bg-[#FFF5F5] border border-[#FFCDD2] px-3 py-1.5 rounded-xl uppercase tracking-widest">6 CAMERAS</span>
            <span className="text-[9px] font-black text-[#6B6B6B] bg-[#FFF5F5] border border-[#FFCDD2] px-3 py-1.5 rounded-xl uppercase tracking-widest">1080p · 24fps</span>
          </div>
          <button
            onClick={() => setActiveTab(activeTab === "grid" ? "focus" : "grid")}
            className="flex-grow md:flex-grow-0 text-[10px] font-black uppercase tracking-widest text-white bg-[#E53935] px-6 py-3 rounded-2xl hover:bg-[#c62828] transition-all shadow-lg shadow-red-50"
          >
            {activeTab === "grid" ? "Focus View" : "Grid View"}
          </button>
        </div>
      </div>

      {/* Alert popup */}
      {popupAlert && (
        <div className="rounded-xl border-2 border-[#ef4444] bg-[#fef2f2] p-3 flex items-start gap-3 animate-pulse shadow-lg shadow-red-100">
          <span className="text-xl mt-0.5">🚨</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-[#dc2626]">AI ALERT — {popupAlert.cam} · {popupAlert.zone}</p>
            <p className="text-xs text-[#dc2626] mt-0.5">{popupAlert.msg}</p>
            <p className="text-[10px] text-[#6B6B6B] mt-0.5">Confidence: {popupAlert.conf}% · Captain notified · {popupAlert.time}</p>
          </div>
          <button onClick={() => setPopupAlert(null)} className="text-[#dc2626] font-bold text-xs shrink-0">✕</button>
        </div>
      )}

      {/* Zone filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {["All", "Kitchen Zone", "Packing Zone", "Delivery Zone", "Storage Area", "Back-of-House", "Counter Area"].map((z) => (
          <button
            key={z}
            onClick={() => setZoneFilter(z)}
            className="whitespace-nowrap rounded-full border px-3 py-1 text-[10px] font-semibold transition-all"
            style={{
              borderColor: zoneFilter === z ? "#E53935" : "#FFCDD2",
              background: zoneFilter === z ? "#FFEBEE" : "#fff",
              color: zoneFilter === z ? "#B71C1C" : "#6B6B6B",
            }}
          >
            {z}
          </button>
        ))}
      </div>

      {/* Camera grid */}
      <div className={`grid gap-4 ${activeTab === "focus" ? "grid-cols-1 max-w-2xl mx-auto" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"}`}>
        {CAMERAS
          .filter((c) => zoneFilter === "All" || c.zone === zoneFilter)
          .map((cam, i) => (
            <CameraCard
              key={cam.id}
              cam={cam}
              isSelected={selectedCam === i}
              onClick={() => { setSelectedCam(i); setActiveTab("focus"); }}
              alertActive={alertActive}
            />
          ))}
      </div>

      {/* Bottom panels: Incident Timeline + AI Insights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Incident Timeline */}
        <div className="rounded-xl border border-[#FFCDD2] bg-white overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#FFCDD2] bg-[#FFEBEE]">
            <div>
              <h3 className="text-sm font-bold text-[#1A1A1A]">AI Incident Timeline</h3>
              <p className="text-[10px] text-[#6B6B6B]">Live updates — last 8 events</p>
            </div>
            <span className="text-[10px] font-bold text-[#E53935] bg-white border border-[#FFCDD2] px-2 py-0.5 rounded-full">
              {incidents.filter(x => x.severity === "critical").length} CRITICAL
            </span>
          </div>
          <div className="divide-y divide-[#FFF5F5] max-h-72 overflow-y-auto">
            {incidents.map((inc, idx) => {
              const col = sevColor(inc.severity);
              return (
                <div key={inc.id} className={`px-4 py-2.5 flex items-start gap-3 transition-colors hover:bg-[#FFF5F5] ${idx === 0 ? "bg-[#FFF5F5]" : ""}`}>
                  <div className="mt-1 flex-shrink-0">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: col.dot }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-black font-mono text-[#6B6B6B]">{inc.time}</span>
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: col.bg, color: col.text }}>{inc.severity.toUpperCase()}</span>
                      <span className="text-[9px] text-[#6B6B6B]">{inc.cam} · {inc.zone}</span>
                    </div>
                    <p className="text-xs text-[#1A1A1A] mt-0.5 truncate">{inc.msg}</p>
                    <p className="text-[9px] text-[#6B6B6B]">Confidence: {inc.conf}%</p>
                  </div>
                  <button
                    onClick={() => onIncident?.()}
                    className="shrink-0 text-[10px] font-bold text-[#B71C1C] hover:underline"
                  >
                    View
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Operational Insights */}
        <div className="rounded-xl border border-[#FFCDD2] bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-[#FFCDD2] bg-[#FFEBEE]">
            <h3 className="text-sm font-bold text-[#1A1A1A]">AI Operational Insights</h3>
            <p className="text-[10px] text-[#6B6B6B]">Generated from behavioral pattern analysis</p>
          </div>
          <div className="p-4 space-y-3">
            {INSIGHTS.map((ins, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-[#FFCDD2] hover:border-[#E53935] transition-colors">
                <span className="text-base mt-0.5 shrink-0">{ins.icon}</span>
                <div className="flex-1 min-w-0">
                  <span className="text-[9px] font-bold text-[#B71C1C] bg-[#FFEBEE] px-1.5 py-0.5 rounded">{ins.tag}</span>
                  <p className="text-xs text-[#1A1A1A] mt-1">{ins.text}</p>
                </div>
              </div>
            ))}
          </div>
          {/* AI pulse footer */}
          <div className="mx-4 mb-4 rounded-lg p-3 flex items-center gap-2"
            style={{ background: "linear-gradient(135deg,#B71C1C,#E53935)", color: "#fff" }}>
            <span className="text-sm">✦</span>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider">Spire.ai Intelligence</p>
              <p className="text-[10px] opacity-80">Packing efficiency -12% · Kitchen congestion risk HIGH · Storage anomaly detected</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
