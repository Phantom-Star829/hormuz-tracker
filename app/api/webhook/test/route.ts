import { NextResponse } from "next/server";
import vessels from "@/data/vessel-counts.json";

export const dynamic = "force-dynamic";

// Fires a test alert to MAKE_ALERT_WEBHOOK env var.
// GET /api/webhook/test  → posts current state to Make.com.
export async function GET() {
  const url = process.env.MAKE_ALERT_WEBHOOK;
  if (!url) {
    return NextResponse.json({ ok: false, error: "MAKE_ALERT_WEBHOOK not set" }, { status: 400 });
  }
  const today = vessels.series.at(-1);
  const prior = vessels.series.at(-2);
  const body = {
    source: "hormuz-tracker",
    test: true,
    date: today?.date,
    transits: today?.transits,
    prior: prior?.transits,
    delta: today && prior ? today.transits - prior.transits : 0,
    stranded: today?.strandedEstimate,
    triggers: ["manual test"],
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return NextResponse.json({ ok: res.ok, status: res.status, sent: body });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
