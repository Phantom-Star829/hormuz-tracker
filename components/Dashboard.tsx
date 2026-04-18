"use client";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import VesselMap from "./VesselMapWrapper";
import Chat from "./Chat";
import AutoRefresh from "./AutoRefresh";

type VesselPoint = { date: string; transits: number; strandedEstimate: number };
type Vessels = {
  updatedAt: string;
  historicalDailyAverage: number;
  strandedBaseline: number;
  series: VesselPoint[];
  source: string;
  demo?: boolean;
};
type Carrier = { name: string; status: "operational" | "limited" | "suspended"; note: string; sourceUrl: string };
type Carriers = { updatedAt: string; carriers: Carrier[] };
type Brent = {
  current: number;
  change: number;
  changePct: number;
  series: { date: string; close: number }[];
  source: string;
  live: boolean;
};
type AlertItem = { severity: "warn" | "alert"; title: string; detail: string; time: string };
type Alerts = { alerts: AlertItem[]; updatedAt: string };

type Positions = {
  updatedAt: string;
  bbox: { minLat: number; maxLat: number; minLon: number; maxLon: number };
  vessels: { mmsi: number; name: string; type: string; lat: number; lon: number; sog: number; cog: number }[];
  demo?: boolean;
};

export default function Dashboard({
  vessels,
  carriers,
  brent,
  alerts,
  positions,
}: {
  vessels: Vessels;
  carriers: Carriers;
  brent: Brent;
  alerts: Alerts;
  positions: Positions;
}) {
  const today = vessels.series.at(-1)!;
  const prior = vessels.series.at(-2)!;
  const delta = today.transits - prior.transits;
  const pctOfAvg = Math.round((today.transits / vessels.historicalDailyAverage) * 100);
  const aboveBaseline = today.strandedEstimate - vessels.strandedBaseline;

  const statusColor = (s: Carrier["status"]) =>
    s === "operational" ? "text-good" : s === "limited" ? "text-accent" : "text-danger";
  const statusDot = (s: Carrier["status"]) =>
    s === "operational" ? "bg-good" : s === "limited" ? "bg-accent" : "bg-danger";

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-muted mb-2">Live Monitor</div>
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Strait of Hormuz — Transit Tracker</h1>
          <p className="text-muted mt-2 text-sm max-w-2xl">
            Daily vessel counts from AIS bounding box (26.2–26.8°N, 56.0–56.6°E) vs a 100/day historical baseline,
            paired with carrier suspension status and Brent crude. Collected hourly via GitHub Actions.
          </p>
        </div>
        <div className="text-xs text-muted tabular text-right space-y-1">
          <div>Updated {new Date(vessels.updatedAt).toLocaleString()}</div>
          <div className="flex md:justify-end"><AutoRefresh /></div>
          {vessels.demo && (
            <div
              className="text-accent cursor-help"
              title="AISStream free tier has sparse volunteer receiver coverage in the Persian Gulf. Every hour the collector samples for 3min; when 0 vessels are observed the collector preserves the last known reading rather than overwriting with zeros. Paid AIS would resolve this."
            >
              AIS coverage gap — last known values
            </div>
          )}
        </div>
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Kpi
          label="Transits today"
          value={today.transits.toString()}
          sub={`${pctOfAvg}% of ${vessels.historicalDailyAverage}/day avg`}
          tone={pctOfAvg < 70 ? "danger" : pctOfAvg < 90 ? "warn" : "good"}
        />
        <Kpi
          label="Day-over-day"
          value={`${delta >= 0 ? "+" : ""}${delta}`}
          sub={delta >= 10 ? "ALERT: +10 or more" : "within normal range"}
          tone={delta >= 10 ? "good" : delta < 0 ? "danger" : "neutral"}
        />
        <Kpi
          label="Stranded vessels"
          value={today.strandedEstimate.toString()}
          sub={`${aboveBaseline >= 0 ? "+" : ""}${aboveBaseline} vs 150 baseline`}
          tone={today.strandedEstimate > 180 ? "danger" : today.strandedEstimate > 150 ? "warn" : "good"}
        />
        <Kpi
          label="Brent crude"
          value={`$${brent.current.toFixed(2)}`}
          sub={`${brent.change >= 0 ? "+" : ""}${brent.change.toFixed(2)} (${brent.changePct.toFixed(2)}%)`}
          tone={brent.change >= 0 ? "warn" : "good"}
        />
      </div>

      {/* Live vessel map */}
      <section className="panel p-5 mb-6">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Live Vessel Positions</h2>
            <span className="text-xs text-muted">
              {positions.vessels.length} vessels in Strait bounding box · updated{" "}
              {new Date(positions.updatedAt).toLocaleTimeString()}
            </span>
          </div>
          <span className="text-[11px] text-muted">OpenStreetMap · OpenSeaMap · AISStream</span>
        </div>
        <VesselMap positions={positions} />
      </section>

      {/* Chat */}
      <div className="mb-6">
        <Chat />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Transits chart — spans 2 cols */}
        <section className="panel p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Daily Vessel Transits</h2>
            <span className="text-xs text-muted">vs 100/day historical avg</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={vessels.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={11} />
                <YAxis stroke="#6b7280" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
                  labelStyle={{ color: "#e5e7eb" }}
                />
                <ReferenceLine y={100} stroke="#10b981" strokeDasharray="4 4" label={{ value: "100/day avg", fill: "#10b981", fontSize: 11, position: "right" }} />
                <Area type="monotone" dataKey="transits" stroke="#f59e0b" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Alerts */}
        <section className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Alerts</h2>
            <span className="text-xs text-muted">+10/day or reopening</span>
          </div>
          {alerts.alerts.length === 0 ? (
            <div className="text-sm text-muted py-8 text-center">No active alerts</div>
          ) : (
            <ul className="space-y-3">
              {alerts.alerts.map((a, i) => (
                <li key={i} className="border border-border rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        a.severity === "alert" ? "bg-good/20 text-good" : "bg-accent/20 text-accent"
                      }`}
                    >
                      {a.severity}
                    </span>
                    <span className="text-xs text-muted tabular">{a.time}</span>
                  </div>
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="text-xs text-muted mt-1">{a.detail}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Brent */}
        <section className="panel p-5 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Brent Crude — 1 month</h2>
            <span className="text-xs text-muted">{brent.live ? "live" : "fallback"} · {brent.source}</span>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={brent.series} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                <XAxis dataKey="date" stroke="#6b7280" fontSize={11} />
                <YAxis
                  stroke="#6b7280"
                  fontSize={11}
                  domain={["auto", "auto"]}
                  tickFormatter={(v: number) => `$${Number(v).toFixed(0)}`}
                  width={50}
                />
                <Tooltip
                  contentStyle={{ background: "#0b0f17", border: "1px solid #1f2937", borderRadius: 8 }}
                  formatter={(v: number) => [`$${Number(v).toFixed(2)}`, "Brent"]}
                />
                <Line type="monotone" dataKey="close" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Carriers */}
        <section className="panel p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-lg font-semibold">Major Carriers</h2>
            <span className="text-xs text-muted">Hormuz status</span>
          </div>
          <ul className="space-y-2">
            {carriers.carriers.map((c) => (
              <li key={c.name} className="flex items-start gap-3 py-2 border-b border-border/50 last:border-0">
                <span className={`${statusDot(c.status)} w-2 h-2 rounded-full mt-1.5 shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium text-sm">{c.name}</span>
                    <span className={`text-[10px] uppercase tracking-wider font-bold ${statusColor(c.status)}`}>
                      {c.status}
                    </span>
                  </div>
                  <div className="text-xs text-muted mt-0.5 leading-snug">{c.note}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <footer className="mt-10 pt-6 border-t border-border text-xs text-muted space-y-1">
        <div>Vessel data: {vessels.source}</div>
        <div>Brent: {brent.source}. Carrier statuses: manual (updated via data/carriers.json in repo).</div>
        <div className="text-[11px]">
          Dashboard revalidates every 60s. AIS collector runs hourly via GitHub Actions — see scripts/collect-ais.mjs.
        </div>
      </footer>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warn" | "danger" | "neutral";
}) {
  const toneColor =
    tone === "good" ? "text-good" : tone === "warn" ? "text-accent" : tone === "danger" ? "text-danger" : "text-muted";
  return (
    <div className="panel p-4">
      <div className="text-xs uppercase tracking-wider text-muted mb-1">{label}</div>
      <div className="text-3xl font-semibold tabular">{value}</div>
      <div className={`text-xs mt-1 tabular ${toneColor}`}>{sub}</div>
    </div>
  );
}
