# Strait of Hormuz — Live Transit Monitor

Live dashboard tracking ship transits through the Strait of Hormuz:
- Daily vessel counts vs 100/day historical average
- Stranded vessel estimate vs 150 baseline
- Major carrier (Maersk, MSC, etc.) suspension status
- Brent crude price (1-month series)
- Alerts on +10 vessel/day day-over-day jumps or strait-reopening thresholds

## Stack (all free tier)

- **Next.js 14** on Vercel free
- **AISStream.io** free WebSocket for AIS vessel data
- **Yahoo Finance** (BZ=F) for Brent crude
- **GitHub Actions** hourly cron runs the AIS collector (Vercel serverless can't hold a WebSocket)
- Carrier statuses kept manually in `data/carriers.json`

## Local dev

```bash
npm install
npm run dev
# http://localhost:3000
```

## Deploy

1. Push this repo to GitHub.
2. Import the repo at https://vercel.com/new — no config needed.
3. Create a free AISStream key at https://aisstream.io/authenticate.
4. Add `AISSTREAM_API_KEY` as a GitHub repo secret (Settings → Secrets → Actions).
5. GitHub Actions will run hourly and commit updated `data/vessel-counts.json`.
6. Vercel redeploys on each commit — dashboard always shows latest numbers.

## Chat access

The dashboard stays public. `POST /api/chat` does not.

1. Choose a long random token on your own machine. Do not commit it, paste it into logs, or prefix the variable with `NEXT_PUBLIC_`.
2. In the Vercel project, set `CHAT_ACCESS_TOKEN` as a server environment variable for Production. Add it to Preview only if preview deployments should serve chat. `ANTHROPIC_API_KEY` stays server-only as well. Names are listed in `.env.example`.
3. Redeploy. The route reads the variable on the server, so a new value applies when the new deployment is serving.
4. Type the token into the masked field on the chat panel. The page keeps it in memory for that view only.
5. To rotate, set a new `CHAT_ACCESS_TOKEN` in Vercel and redeploy. The previous value stops working once that deployment is live. Remove the old value from Vercel. There is nothing to delete from the repository.

If `CHAT_ACCESS_TOKEN` is missing or blank, the route returns 503 and does not call Anthropic.

## Data flow

```
AISStream (free WS) ──► GitHub Action (hourly) ──► data/vessel-counts.json ──► Next.js RSC ──► Dashboard
Yahoo Finance ────────────────────────────────────► /api/brent (revalidate 5min) ──────────────► Dashboard
data/carriers.json (manual edits) ──────────────► /api/carriers ────────────────────────────────► Dashboard
```

## Limits of free tier

- AISStream free tier coverage depends on volunteer receivers — Persian Gulf coverage is partial. The `demo: true` flag in `vessel-counts.json` flips to `false` once the collector has run once.
- Carrier statuses are manual — set up a second GitHub Action with a scraper or LLM summarizer if you want those automated.
- The dashboard revalidates every 60s; API routes cache 5min.
