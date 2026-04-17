import Anthropic from "@anthropic-ai/sdk";
import vesselsData from "@/data/vessel-counts.json";
import carriersData from "@/data/carriers.json";
import positionsData from "@/data/vessel-positions.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_STATIC = `You are the onboard analyst for a Strait of Hormuz live transit dashboard.

Your job: answer user questions about what they see on the dashboard — transit counts, carrier status, oil price, stranded vessels, vessel positions on the map, and what it all means for shipping and markets.

Ground rules:
- Be direct. Short, confident answers. Numbers front and center.
- When the user asks "why" or "what does this mean", explain using the dashboard data plus general knowledge of shipping economics and geopolitics.
- If the answer isn't in the data, say so rather than guessing.
- The user is an operator watching this in real time, not a student. Skip throat-clearing.
- Never use em dashes. Use commas instead.

Data context:

**Historical baselines**
- Normal daily transits through Strait of Hormuz: ~100 vessels/day
- Normal stranded/anchored count in anchorages: ~150 vessels
- Strait handles ~20% of global oil consumption, ~25% of global LNG

**Dashboard data sources**
- Vessel counts & positions: AISStream.io free WebSocket (hourly collection via GitHub Actions), bounding box 26.2-26.8°N, 56.0-56.6°E
- Brent crude: Yahoo Finance BZ=F 1-month series
- Carrier status: Google News RSS scrape, classified by keyword (suspend/reroute → suspended, resume → operational, limit/surcharge → limited)
- Alerts fire when day-over-day transits jump +10 or return to 90%+ of baseline (reopening signal)

**Major carriers tracked**
Maersk, MSC, CMA CGM, Hapag-Lloyd, ONE, Evergreen. Tanker, cargo, passenger, and fishing vessel types are color-coded on the map (tanker=amber, cargo=green).

**Ship economics quick reference**
- Cape of Good Hope reroute adds ~10-14 days + $1M+ per voyage
- War-risk insurance premiums can jump 5-10x when strait is contested
- LNG carriers cannot reroute (LNG evaporates) so they either wait or risk the transit
- Brent typically spikes 10-30% on serious Hormuz disruption`;

export async function POST(req: Request) {
  const { messages } = await req.json();
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("messages required", { status: 400 });
  }

  const today = vesselsData.series.at(-1);
  const prior = vesselsData.series.at(-2);
  const liveSnapshot = `**Current dashboard state** (updated ${vesselsData.updatedAt})

Transits today: ${today?.transits ?? "n/a"} vessels (${Math.round(((today?.transits ?? 0) / vesselsData.historicalDailyAverage) * 100)}% of 100/day baseline)
Yesterday: ${prior?.transits ?? "n/a"} vessels
Day-over-day delta: ${today && prior ? (today.transits - prior.transits >= 0 ? "+" : "") + (today.transits - prior.transits) : "n/a"}
Stranded estimate today: ${today?.strandedEstimate ?? "n/a"} (baseline 150)

Transit series (last ${vesselsData.series.length} days):
${vesselsData.series.map((d) => `  ${d.date}: ${d.transits} transits, ${d.strandedEstimate} stranded`).join("\n")}

Carrier status (updated ${carriersData.updatedAt}):
${carriersData.carriers.map((c) => `  ${c.name}: ${c.status.toUpperCase()} — ${c.note}`).join("\n")}

Vessel positions on map right now (${positionsData.vessels.length} in bounding box):
${positionsData.vessels
  .map((v) => `  ${v.name} (${v.type}, MMSI ${v.mmsi}): ${v.lat.toFixed(3)}°N ${v.lon.toFixed(3)}°E, ${v.sog.toFixed(1)}kn @ ${v.cog}°${v.sog <= 1 ? " [anchored]" : ""}`)
  .join("\n")}
${positionsData.demo ? "\n(NOTE: positions are demo data until AISStream key is configured)" : ""}`;

  const stream = await anthropic.messages.stream({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: [
      { type: "text", text: SYSTEM_STATIC, cache_control: { type: "ephemeral" } },
      { type: "text", text: liveSnapshot },
    ],
    messages: messages.map((m: { role: "user" | "assistant"; content: string }) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (e: any) {
        controller.enqueue(encoder.encode(`\n\n[error: ${e.message}]`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
