import { NextResponse } from "next/server";
import vessels from "@/data/vessel-counts.json";

export const revalidate = 300;

export async function GET() {
  const series = vessels.series;
  const alerts: { severity: "warn" | "alert"; title: string; detail: string; time: string }[] = [];

  if (series.length >= 2) {
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
    const avg = vessels.historicalDailyAverage;
    if (today.transits >= avg * 0.9) {
      alerts.push({
        severity: "alert",
        title: "Transit volume near historical average",
        detail: `${today.transits}/day vs ${avg}/day baseline — strait likely reopening.`,
        time: today.date,
      });
    }
    if (today.strandedEstimate > vessels.strandedBaseline) {
      alerts.push({
        severity: "warn",
        title: `${today.strandedEstimate} vessels stranded`,
        detail: `Above baseline of ${vessels.strandedBaseline}. Backup continues to grow.`,
        time: today.date,
      });
    }
  }

  return NextResponse.json({ alerts, updatedAt: new Date().toISOString() });
}
