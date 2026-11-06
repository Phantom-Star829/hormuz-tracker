# Chat-only private access token

Approved by Nick: "Yes, implement the chat-only private access token design."

## Problem

`POST /api/chat` spends `ANTHROPIC_API_KEY` with no caller check. The home page stays a public dashboard. The GitHub repository stays public. This design gates only that route.

## Decision

Require a server-only shared token, `CHAT_ACCESS_TOKEN`, on `POST /api/chat`. The operator types it into a masked chat field. The browser holds it in React state for that page view and sends it as `Authorization: Bearer <token>`. The server compares it before it reads the body, loads dashboard context, or constructs the Anthropic client.

There is no existing session or account system. This does not add one.

## Access rules

`CHAT_ACCESS_TOKEN` is read inside the request, not at import.

| Condition | Status | Body |
|---|---|---|
| Variable unset, empty, or whitespace-only | 503 | `chat unavailable` |
| Header missing, scheme not exactly `Bearer `, or token bytes differ | 401 | `unauthorized` |
| Authorized, body is not JSON or `messages` is not a non-empty array of `{ role: "user" \| "assistant", content: string }` | 400 | `messages required` |
| Authorized and valid, `ANTHROPIC_API_KEY` unset or empty | 500 | `chat unavailable` |
| Authorized and valid, provider accepts the prompt | 200 | `text/plain` stream |

A correct bearer token does not override a missing access-token env var. The response is 503.

Comparison:

- The scheme prefix is the exact string `Bearer ` (capital B, one trailing space). `bearer`, `Basic`, `Token`, a missing space, and the raw token are 401.
- The presented secret is the remainder of the header, unmodified. No trim and no Unicode normalization.
- Compare UTF-8 bytes with `crypto.timingSafeEqual` on equal-length buffers. A length mismatch, lone surrogate, or other Unicode string must return false and must not throw.
- The access token is not written to logs, the provider payload, context-fetch URLs, context-fetch headers, or response bodies. Provider errors are not copied into the response.

## Provider and context

The Anthropic client is constructed only after authorization, message validation, and a non-empty `ANTHROPIC_API_KEY`. Importing the route with the provider key unset must succeed, and a rejected request must still return 503 or 401.

Rejected requests, including invalid messages after a good token, perform no context fetch and no provider call. Context fetches stay on the existing public GitHub raw URLs and do not receive the caller’s Authorization header.

The dashboard, map, and every other API route stay unauthenticated.

## Client

The chat panel gains one `type="password"` field, `autoComplete="off"`, `spellCheck={false}`. The value lives in component state only. It is not written to `localStorage`, `sessionStorage`, cookies, the query string, `NEXT_PUBLIC_` env, or a hardcoded constant.

An empty field does not call the network. A typed token is sent only on `POST /api/chat` as the Authorization header. The JSON body remains `{ messages }` only. Server 401 and 503 render fixed sentences that do not echo the token.

## Configuration

No real token is generated or committed.

- Name: `CHAT_ACCESS_TOKEN`
- Where: Vercel project environment, server runtime, Production (and Preview only if preview chat should work)
- Do not prefix it with `NEXT_PUBLIC_`
- Do not put it in GitHub Actions. The collector does not call this route
- Set or rotate the value, then redeploy. The previous value stops matching after the new deployment is serving
- `.env.example` lists the name with an empty value

`ANTHROPIC_API_KEY` stays server-only as well.

## Tests

Route tests mock `@anthropic-ai/sdk` and global `fetch`.

- Missing header, wrong token, malformed header, wrong scheme, and length mismatch return 401, do not read the body, and call neither fetch nor the provider
- Env unset, empty, and whitespace-only return 503 even when the header carries a token
- Unicode, lone surrogates, and unequal byte lengths do not throw and do not match
- Equal UTF-8 bytes match, including multibyte characters. NFC and NFD do not match each other
- Invalid JSON and invalid messages after a correct token return 400 with zero fetch and provider calls
- A valid authorized request streams the mocked provider text, constructs the client once with the provider key, and does not place the access token in the provider arguments or any fetch URL, header, or body
- A provider exception does not echo the access token
- Importing the module does not construct the provider

Client tests: masked input, memory-only storage, request shape, and no token in the URL, body, logs, or storage. A production build with the fake value `chat-access-sentinel-do-not-ship` must not contain that value in `.next/static`.

## Out of scope

User accounts, repository visibility, other routes (including the Make.com webhook), Next.js upgrades, merges, and deployments.
