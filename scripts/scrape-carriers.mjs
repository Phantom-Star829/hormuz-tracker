// Scrapes shipping news for Hormuz-related carrier announcements.
// Uses Google News RSS (free, no key) per carrier — fast, reliable workaround
// for carriers that don't expose their own RSS feeds.

import Parser from "rss-parser";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "data", "carriers.json");
const parser = new Parser({ timeout: 15000 });

const CARRIERS = [
  { name: "Maersk",      sourceUrl: "https://www.maersk.com/news" },
  { name: "MSC",         sourceUrl: "https://www.msc.com/en/newsroom" },
  { name: "CMA CGM",     sourceUrl: "https://www.cma-cgm.com/news" },
  { name: "Hapag-Lloyd", sourceUrl: "https://www.hapag-lloyd.com/en/press.html" },
  { name: "ONE",         sourceUrl: "https://www.one-line.com/en/news" },
  { name: "Evergreen",   sourceUrl: "https://www.evergreen-marine.com/tbi1/jsp/TBI1_News.jsp" },
];

const SUSPEND_RX = /\b(suspend|halt|pause|stop)\w*/i;
const REROUTE_RX = /\b(rerout|divert|cape of good hope|bypass)\w*/i;
const RESUME_RX  = /\b(resum|reopen|restart|return to service)\w*/i;
const LIMIT_RX   = /\b(limit|reduc|surcharg|escort|risk)\w*/i;

function classify(text) {
  if (RESUME_RX.test(text))   return { status: "operational", reason: "resumption signal" };
  if (SUSPEND_RX.test(text))  return { status: "suspended",   reason: "suspension signal" };
  if (REROUTE_RX.test(text))  return { status: "suspended",   reason: "rerouting signal" };
  if (LIMIT_RX.test(text))    return { status: "limited",     reason: "limited / surcharge signal" };
  return null;
}

async function carrierStatus(carrier) {
  const q = encodeURIComponent(`${carrier.name} Strait of Hormuz`);
  const feed = `https://news.google.com/rss/search?q=${q}+when:14d&hl=en-US&gl=US&ceid=US:en`;
  try {
    const parsed = await parser.parseURL(feed);
    const items = parsed.items.slice(0, 8);
    for (const it of items) {
      const hit = classify(`${it.title ?? ""} ${it.contentSnippet ?? ""}`);
      if (hit) {
        return {
          name: carrier.name,
          status: hit.status,
          note: it.title?.slice(0, 140) ?? hit.reason,
          sourceUrl: it.link ?? carrier.sourceUrl,
        };
      }
    }
    // No signal in last 14d — default operational
    return { name: carrier.name, status: "operational", note: "No disruption news in last 14 days", sourceUrl: carrier.sourceUrl };
  } catch (e) {
    console.error(`${carrier.name}: ${e.message}`);
    return { name: carrier.name, status: "operational", note: "Status check unavailable", sourceUrl: carrier.sourceUrl };
  }
}

const carriers = await Promise.all(CARRIERS.map(carrierStatus));
const payload = { updatedAt: new Date().toISOString(), carriers };
fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`Wrote ${OUT}`);
carriers.forEach((c) => console.log(`  ${c.name.padEnd(14)} ${c.status.padEnd(12)} ${c.note.slice(0, 60)}`));
