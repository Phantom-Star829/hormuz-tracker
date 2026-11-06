# Chat access token Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a server-only bearer token on `POST /api/chat` before any parse, context fetch, or Anthropic call, and collect that token from a masked in-memory chat field.

**Architecture:** `app/api/chat/access.ts` decides 503 vs 401 vs allow with a constant-time byte compare. `app/api/chat/route.ts` calls that helper first, then parses messages, then fetches context and constructs the Anthropic client. `components/Chat.tsx` keeps the typed token in React state and sends it only as an Authorization header.

**Tech Stack:** Next.js 14 route handlers, Node 22 `node:test` via `tsx`, `react-test-renderer`, mocked `@anthropic-ai/sdk`.

## Global Constraints

- Fail closed: missing, empty, or whitespace-only `CHAT_ACCESS_TOKEN` returns 503 `chat unavailable`
- Any other failed credential returns 401 `unauthorized` and does not read the body
- Scheme prefix is exactly `Bearer `
- Compare UTF-8 bytes with `crypto.timingSafeEqual` on equal-length buffers; never throw on length, Unicode, or lone surrogates
- No trim and no Unicode normalization of the presented token
- Construct `new Anthropic(...)` only after authorization, valid messages, and a non-empty `ANTHROPIC_API_KEY`
- Do not send the access token to the provider, context fetches, logs, or response bodies
- Client token is a masked input in React state only
- Dashboard and other routes stay public
- Fake test sentinel only: `chat-access-sentinel-do-not-ship`. Generate no real secret
- Do not merge or deploy

---

### Task 1: Access decision

**Files:**
- Create: `app/api/chat/access.ts`
- Test: `tests/chat-access.test.ts`

**Interfaces:**
- Consumes: Node `crypto.timingSafeEqual`
- Produces: `tokensEqual(presented: string, expected: string): boolean` and `authorizeChat(authorization: string | null, configuredToken: string | undefined): { ok: true } | { ok: false; status: 401 | 503 }`

- [ ] **Step 1: Write the failing test**

Add devDependency `tsx` and `"test": "node --experimental-test-module-mocks --disable-warning=ExperimentalWarning --import tsx --test tests/*.test.ts tests/*.test.tsx"`.

Cover unset, `""`, whitespace, missing header, `Bearer` without a space, empty bearer, `Basic`, `bearer`, `Token`, raw token, same-length mismatch, shorter and longer tokens, exact match, multibyte match, NFC vs NFD, and a lone surrogate. Each mismatch must return false or 401 without throwing. The case list in the spec is the full set; do not add accounts, cookies, or other routes.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-test-module-mocks --disable-warning=ExperimentalWarning --import tsx --test tests/chat-access.test.ts`

Expected: FAIL because `authorizeChat` / `tokensEqual` are missing or return the wrong decision.

- [ ] **Step 3: Write minimal implementation**

Whitespace-only configured values return 503 before the header is inspected. Otherwise require the `Bearer ` prefix and `tokensEqual`. Pad both buffers to the same length, run `timingSafeEqual`, and also require the original byte lengths to be equal.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS, no throw.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/access.ts tests/chat-access.test.ts package.json package-lock.json
git commit -m "test: gate chat access with a constant-time token compare"
```

### Task 2: Route ordering and mocked provider

**Files:**
- Modify: `app/api/chat/route.ts`
- Test: `tests/chat-route.test.ts`

**Interfaces:**
- Consumes: `authorizeChat` from Task 1
- Produces: `POST(req: Request): Promise<Response>`

- [ ] **Step 1: Write the failing test**

Mock `@anthropic-ai/sdk` so the constructor records options and throws when `apiKey` is missing. `messages.stream` records its argument and yields one `text_delta` of `mocked-transit`. Mock `globalThis.fetch` and fail the test if a rejected request calls it.

Assert:

- Importing the route leaves the constructor uncalled
- Valid messages with no header, a wrong token, a bad scheme, or a different length are 401, do not call `req.json`, fetch, or the provider
- Unset, empty, and whitespace env values are 503 even with a bearer token
- Authorized invalid JSON, empty messages, a non-array, a bad role, and a non-string content are 400 with zero fetch and zero provider calls
- Authorized valid messages stream `mocked-transit`, construct the client once with `anthropic-test-key-not-real`, and keep `chat-access-sentinel-do-not-ship` out of stream arguments, fetch URLs, fetch headers, fetch bodies, and the response
- A throwing provider stream does not copy that sentinel into the response
- Missing `ANTHROPIC_API_KEY` after a valid authorized request returns 500 and does not fetch or construct

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL because the current route constructs Anthropic at import and does not return 401/503.

- [ ] **Step 3: Write minimal implementation**

Call `authorizeChat` first. Parse and validate messages second. If the provider key is missing, return 500 `chat unavailable`. Fetch the three existing context documents, then `new Anthropic({ apiKey })` and stream. On a stream failure, enqueue `\n\n[error]` with no exception message. Keep the existing system prompt and context wording.

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat/route.ts tests/chat-route.test.ts
git commit -m "feat: reject anonymous chat calls before the provider"
```

### Task 3: Masked in-memory client

**Files:**
- Modify: `components/Chat.tsx`
- Test: `tests/chat-client.test.tsx`

**Interfaces:**
- Consumes: `POST /api/chat` header contract from Task 2
- Produces: password field plus `Authorization` on the existing chat fetch

- [ ] **Step 1: Write the failing test**

Render with `react-test-renderer`. Assert a `type="password"` input with `autoComplete="off"`. A suggestion click with an empty token does not fetch. After the password field changes to `chat-access-sentinel-do-not-ship`, a suggestion click fetches `POST /api/chat` with that bearer header and a JSON body of `{ messages }` only. The token is absent from the URL, body, console, `localStorage`, and `sessionStorage`. Source text for `components/Chat.tsx` contains none of `localStorage`, `sessionStorage`, `NEXT_PUBLIC_`, `CHAT_ACCESS_TOKEN`, or the sentinel.

- [ ] **Step 2: Run test to verify it fails**

Expected: FAIL because the password field and header are absent.

- [ ] **Step 3: Write minimal implementation**

Add the masked input bound to `useState`. If the trimmed token is empty, set the notice `Enter the access token.` and return. Otherwise send the raw token in the Authorization header. Map 401 to `Access token was rejected.` and 503 to `Chat is unavailable.`

- [ ] **Step 4: Run test to verify it passes**

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/Chat.tsx tests/chat-client.test.tsx package.json package-lock.json
git commit -m "feat: send the chat token from memory only"
```

### Task 4: Docs, example env, and client bundle scan

**Files:**
- Create: `.env.example`
- Create: `scripts/check-client-bundle.mjs`
- Modify: `README.md`
- Modify: `REQUIREMENTS.md`
- Modify: `package.json`

- [ ] **Step 1: Document the server env**

README: set `CHAT_ACCESS_TOKEN` in Vercel, do not use `NEXT_PUBLIC_`, do not commit a value, redeploy after set and after rotation. `.env.example` lists `CHAT_ACCESS_TOKEN=` and `ANTHROPIC_API_KEY=` empty. REQUIREMENTS: chat requires this server token; user accounts stay out of scope; the dashboard stays public.

- [ ] **Step 2: Add the bundle scan**

`npm run test:bundle` builds with `CHAT_ACCESS_TOKEN=chat-access-sentinel-do-not-ship` and exits non-zero if `.next/static` contains that sentinel.

- [ ] **Step 3: Verify**

Run `npm test`, `npm run test:bundle`, and `npx tsc --noEmit`. There is no ESLint script in this repo. Expected: tests pass, bundle scan passes, tsc exits 0.

- [ ] **Step 4: Commit**

```bash
git add .env.example scripts/check-client-bundle.mjs README.md REQUIREMENTS.md package.json
git commit -m "docs: record server-only chat token setup"
```
