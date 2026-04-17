import { NextResponse } from "next/server";

export const revalidate = 300;

type Quote = { date: string; close: number };

async function fetchYahoo(): Promise<{ current: number; change: number; changePct: number; series: Quote[] } | null> {
  try {
    const url =
      "https://query1.finance.yahoo.com/v8/finance/chart/BZ=F?interval=1d&range=1mo";
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (hormuz-tracker)" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r) return null;
    const ts: number[] = r.timestamp ?? [];
    const closes: (number | null)[] = r.indicators?.quote?.[0]?.close ?? [];
    const series: Quote[] = ts
      .map((t, i) => ({
        date: new Date(t * 1000).toISOString().slice(0, 10),
        close: closes[i] ?? 0,
      }))
      .filter((q) => q.close);
    const current = r.meta?.regularMarketPrice ?? series.at(-1)?.close ?? 0;
    const prev = r.meta?.chartPreviousClose ?? series.at(-2)?.close ?? current;
    const change = current - prev;
    const changePct = prev ? (change / prev) * 100 : 0;
    return { current, change, changePct, series };
  } catch {
    return null;
  }
}

export async function GET() {
  const live = await fetchYahoo();
  if (live) return NextResponse.json({ ...live, source: "Yahoo Finance (BZ=F)", live: true });

  // Fallback demo data so the dashboard still renders
  const today = new Date();
  const series: Quote[] = Array.from({ length: 22 }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (21 - i));
    return { date: d.toISOString().slice(0, 10), close: 78 + i * 0.4 + Math.sin(i / 3) * 1.6 };
  });
  const current = series.at(-1)!.close;
  const prev = series.at(-2)!.close;
  return NextResponse.json({
    current,
    change: current - prev,
    changePct: ((current - prev) / prev) * 100,
    series,
    source: "Fallback (Yahoo fetch failed)",
    live: false,
  });
}
