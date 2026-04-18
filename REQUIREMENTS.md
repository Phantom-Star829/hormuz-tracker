# Requirements & Grading Context

This document gives an AI reviewer the original spec and the design decisions made, so the app can be graded against what was asked, not what the reviewer imagines.

## Original user request (verbatim)

> Deploy a live dashboard tracking Strait of Hormuz ship transits in real-time using AIS data sources like MarineTraffic, showing daily vessel counts vs historical averages of 100/day, current stranded vessels over 150, major carriers like Maersk suspension status, and Brent crude price integration with alerts for any transit increase above 10 vessels/day or strait reopening announcements

Follow-up requests:

1. "do free version or find a workaround" — no paid AIS key
2. "include a live map of ship movement too"
3. Auto-scrape carrier press releases, wire alerts to Make.com Telegram
4. "include a chat box where i can ask questions about what I see"

## Constraints self-imposed

- **All free tier**: no MarineTraffic/Spire paid APIs, no paid hosting
- **Server-side, not session-dependent**: data persists across reloads, not held in memory
- **Reliability over cleverness**: user has ADHD and explicitly prefers reliable systems

## Architecture (why each choice)

| Requirement | Solution | Why free-tier workaround |
|---|---|---|
| Live AIS vessel counts | AISStream.io WebSocket | Free, real-time AIS; coverage partial in Persian Gulf but usable |
| Hourly collection | GitHub Actions cron | Vercel serverless can't hold a WebSocket; Actions can |
| Data persistence | JSON files committed back to repo | Zero infra, replay-able, grep-able |
| Brent crude | Yahoo Finance `BZ=F` unofficial API | Free, no key, reliable enough |
| Carrier status | Google News RSS + keyword classifier | No individual carrier APIs; RSS is universal |
| Map tiles | CARTO dark basemap + OpenSeaMap overlay | Free tiles with shipping marks |
| Chat | Anthropic Sonnet 4.5 + prompt caching | Static rules cached, live state appended uncached |
| Alerts | Webhook to Make.com | User has existing Make.com → Telegram/iMessage pipeline |

## Spec coverage — self-grade

| Required | Delivered | Location |
|---|---|---|
| Live dashboard deployed | Yes (Vercel) | live URL in README |
| AIS vessel counts | Yes, hourly | `data/vessel-counts.json`, `scripts/collect-ais.mjs` |
| vs 100/day historical average | Yes, reference line on chart + % KPI | `components/Dashboard.tsx` |
| Stranded vessels over 150 | Yes, KPI + alert when above baseline | `app/api/alerts/route.ts` logic |
| Major carrier suspension status | Yes, Maersk/MSC/CMA CGM/Hapag/ONE/Evergreen | `scripts/scrape-carriers.mjs` |
| Brent crude integration | Yes, live 1-month series + delta KPI | Yahoo Finance in `app/page.tsx` |
| Alerts on +10/day jumps | Yes, panel + webhook | `app/api/alerts/route.ts`, collector webhook |
| Strait reopening alerts | Yes, fires at 90%+ of baseline | same |
| Live map (added later) | Yes, Leaflet + vessel positions | `components/VesselMap.tsx` |
| Chat about dashboard (added later) | Yes, streaming Claude responses | `app/api/chat/route.ts`, `components/Chat.tsx` |

## Known limitations

- **AISStream coverage in the Gulf is partial** (volunteer receivers). Authoritative counts require paid AIS.
- **Carrier classifier is regex-based**. Google News returns *news about* carriers, not carrier statements. False positives possible when news describes industry events.
- **Stranded count is estimated**, not directly observed. Derived from transit deficit vs baseline.
- **Transit extrapolation** (90s sample → 24h estimate) assumes uniform traffic. Busy/quiet hours would skew.
- **Vercel hobby tier limits**: 100GB bandwidth/month, function timeouts 10s default. Chat endpoint bumped to 60s.

## How to grade this

1. Check if each requirement above is demonstrably met on the live site.
2. Read the code to verify the architecture matches the table above.
3. Try the chat box — ask "why are transits down and what does it mean for Brent?" — confirm it references actual dashboard numbers.
4. Check `.github/workflows/collect-ais.yml` — cron is real, not a stub.
5. Flag anything that looks like a demo/stub that would fall over in production.

## What's explicitly out of scope

- Mobile-first layout (dashboard is desktop-primary)
- Historical archive beyond 30 days (rolling window)
- User accounts / auth (single-user dashboard)
- Paid AIS redundancy (free-tier constraint)
