// Hourly AIS collector for the Strait of Hormuz.
// Connects to AISStream.io (free WebSocket) for 90s, counts unique MMSIs
// observed inside the Strait bounding box, appends to data/vessel-counts.json.
//
// Run via GitHub Actions (see .github/workflows/collect-ais.yml).
// Requires: AISSTREAM_API_KEY env var — free key from https://aisstream.io/

import WebSocket from "ws";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "..", "data", "vessel-counts.json");
const POSITIONS_FILE = path.join(__dirname, "..", "data", "vessel-positions.json");

const BBOX = [[26.2, 56.0], [26.8, 56.6]]; // [[minLat,minLon],[maxLat,maxLon]]
const LISTEN_MS = 90_000;
const API_KEY = process.env.AISSTREAM_API_KEY;

if (!API_KEY) {
  console.error("Missing AISSTREAM_API_KEY — skipping collection.");
  process.exit(0);
}

const seen = new Set();
const latest = new Map(); // mmsi -> { lat, lon, sog, cog, name, type }

const SHIP_TYPE = (code) => {
  if (code >= 70 && code <= 79) return "Cargo";
  if (code >= 80 && code <= 89) return "Tanker";
  if (code >= 60 && code <= 69) return "Passenger";
  if (code === 30) return "Fishing";
  return "Other";
};

const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

ws.on("open", () => {
  ws.send(
    JSON.stringify({
      APIKey: API_KEY,
      BoundingBoxes: [BBOX],
      FilterMessageTypes: ["PositionReport", "ShipStaticData"],
    }),
  );
  console.log(`Listening ${LISTEN_MS / 1000}s to AISStream…`);
  setTimeout(() => ws.close(), LISTEN_MS);
});

ws.on("message", (raw) => {
  try {
    const msg = JSON.parse(raw.toString());
    const mmsi = msg?.MetaData?.MMSI;
    if (!mmsi) return;
    seen.add(mmsi);
    const cur = latest.get(mmsi) ?? { mmsi, name: msg?.MetaData?.ShipName?.trim() || `MMSI ${mmsi}`, type: "Other" };
    if (msg.MessageType === "PositionReport") {
      const pr = msg.Message?.PositionReport;
      if (pr) {
        cur.lat = pr.Latitude;
        cur.lon = pr.Longitude;
        cur.sog = pr.Sog ?? 0;
        cur.cog = Math.round(pr.Cog ?? 0);
      }
    } else if (msg.MessageType === "ShipStaticData") {
      const sd = msg.Message?.ShipStaticData;
      if (sd) {
        cur.type = SHIP_TYPE(sd.Type ?? 0);
        if (sd.Name) cur.name = sd.Name.trim();
      }
    }
    latest.set(mmsi, cur);
  } catch {}
});

ws.on("close", async () => {
  const count = seen.size;
  console.log(`Unique vessels observed: ${count}`);

  // Extrapolate sampled window → daily transit estimate (rough: vessels in bbox * 24 / hours_sampled).
  // With 90s window, most ships traversing take ~30-60min, so we use count directly as a snapshot,
  // then scale by typical transit time vs sampling window.
  const hoursInDay = 24;
  const sampleHours = LISTEN_MS / 1000 / 3600;
  const avgTransitHours = 1.5; // typical time to cross the bbox
  const estimatedDaily = Math.round((count * hoursInDay) / (sampleHours + avgTransitHours));

  const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  const today = new Date().toISOString().slice(0, 10);
  const idx = data.series.findIndex((d) => d.date === today);
  const strandedEstimate = Math.max(150, (data.series.at(-1)?.strandedEstimate ?? 150) + (100 - estimatedDaily) / 2);
  const entry = { date: today, transits: estimatedDaily, strandedEstimate: Math.round(strandedEstimate) };

  if (idx >= 0) data.series[idx] = entry;
  else data.series.push(entry);

  // Keep last 30 days
  data.series = data.series.slice(-30);
  data.updatedAt = new Date().toISOString();
  data.demo = false;
  data.source = `AISStream.io live feed — ${count} unique MMSI in last ${Math.round(sampleHours * 60)}min sample`;

  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  console.log(`Wrote ${DATA_FILE}: transits=${estimatedDaily}`);

  const vessels = Array.from(latest.values()).filter((v) => typeof v.lat === "number" && typeof v.lon === "number");
  const posPayload = {
    updatedAt: new Date().toISOString(),
    bbox: { minLat: BBOX[0][0], maxLat: BBOX[1][0], minLon: BBOX[0][1], maxLon: BBOX[1][1] },
    vessels,
    demo: false,
  };
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(posPayload, null, 2));
  console.log(`Wrote ${POSITIONS_FILE}: ${vessels.length} positions`);

  // Fire Make.com webhook on meaningful alerts
  const hookUrl = process.env.MAKE_ALERT_WEBHOOK;
  if (hookUrl && data.series.length >= 2) {
    const today = data.series.at(-1);
    const prior = data.series.at(-2);
    const delta = today.transits - prior.transits;
    const triggers = [];
    if (delta >= 10) triggers.push(`Transits +${delta}/day (reopening signal)`);
    if (today.transits >= data.historicalDailyAverage * 0.9) triggers.push(`Near-normal volume (${today.transits}/day)`);
    if (triggers.length) {
      try {
        const body = {
          source: "hormuz-tracker",
          date: today.date,
          transits: today.transits,
          prior: prior.transits,
          delta,
          stranded: today.strandedEstimate,
          triggers,
        };
        const res = await fetch(hookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        console.log(`Webhook fired: ${res.status}`);
      } catch (e) {
        console.error("Webhook error:", e.message);
      }
    }
  }

  process.exit(0);
});

ws.on("error", (e) => {
  console.error("WS error:", e.message);
  process.exit(1);
});
