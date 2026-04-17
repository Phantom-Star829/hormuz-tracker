import Dashboard from "@/components/Dashboard";
import vesselsData from "@/data/vessel-counts.json";
import carriersData from "@/data/carriers.json";
import positionsData from "@/data/vessel-positions.json";

export const revalidate = 60;

type Quote = { date: string; close: number };

async function fetchBrent() {
  try {
    const res = await fetch(
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=1mo",
      {
        headers: { "User-Agent": "Mozilla/5.0 (hormuz-tracker)" },
        next: { revalidate: 300 },
      },
    );
    if (!res.ok) throw new Error(`Yahoo ${res.status}`);
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r) throw new Error("no result");
    const ts: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const series: Quote[] = ts
      .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] ?? 0 }))
      .filter((q) => q.close);
    const current = r.meta?.regularMarketPrice ?? series.at(-1)?.close ?? 0;
    const prev = r.meta?.chartPreviousClose ?? series.at(-2)?.close ?? current;
    const change = current - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    return { current, change, changePct, series, source: "Yahoo Finance (BZ=F)", live: true };
  } catch {
    const today = new Date();
    const series: Quote[] = Array.from({ length: 22 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (21 - i));
      return { date: d.toISOString().slice(0, 10), close: 78 + i * 0.4 + Math.sin(i / 3) * 1.6 };
    });
    const current = series.at(-1)!.close;
    const prev = series.at(-2)!.close;
    return {
      current,
      change: current - prev,
      changePct: ((current - prev) / prev) * 100,
      series,
      source: "Fallback (Yahoo fetch failed)",
      live: false,
    };
  }
}

function computeAlerts() {
  const series = vesselsData.series;
  const alerts: { severity: "warn" | "alert"; title: string; detail: string; time: string }[] = [];
  if (series.length < 2) return { alerts, updatedAt: new Date().toISOString() };
  const today = series.at(-1)!;
  const prior = series.at(-2)!;
  const delta = today.transits - prior.transits;
  if (delta >= 10) {
    alerts.push({
      severity: "alert",
      title: `Transits jumped +${delta} vessels/day`,
      detail: `Day-over-day increase from ${prior.transits} to ${today.transits}. Possible easing of disruption.`,
      time: today.date,
    });
  }
  if (today.transits >= vesselsData.historicalDailyAverage * 0.9) {
    alerts.push({
      severity: "alert",
      title: "Transit volume near historical average",
      detail: `${today.transits}/day vs ${vesselsData.historicalDailyAverage}/day baseline — strait likely reopening.`,
      time: today.date,
    });
  }
  if (today.strandedEstimate > vesselsData.strandedBaseline) {
    alerts.push({
      severity: "warn",
      title: `${today.strandedEstimate} vessels stranded`,
      detail: `Above baseline of ${vesselsData.strandedBaseline}. Backup continues to grow.`,
      time: today.date,
    });
  }
  return { alerts, updatedAt: new Date().toISOString() };
}

export default async function Page() {
  const brent = await fetchBrent();
  const alerts = computeAlerts();
  return (
    <Dashboard
      vessels={vesselsData as any}
      carriers={carriersData as any}
      brent={brent}
      alerts={alerts}
      positions={positionsData as any}
    />
  );
}
