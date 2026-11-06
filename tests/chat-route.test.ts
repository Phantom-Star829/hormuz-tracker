import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { POST } from "../app/api/chat/route";

const SECRET = "chat-access-sentinel-do-not-ship";
const PROVIDER_KEY = "anthropic-test-key-not-real";
const USER_TEXT = "Why are transits down?";

const originalFetch = globalThis.fetch;
const fetchCalls: { url: string; init?: RequestInit; body: string }[] = [];

const sse = [
  "event: message_start",
  `data: ${JSON.stringify({
    type: "message_start",
    message: {
      id: "msg_test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 1 },
    },
  })}`,
  "",
  "event: content_block_start",
  `data: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}`,
  "",
  "event: content_block_delta",
  `data: ${JSON.stringify({
    type: "content_block_delta",
    index: 0,
    delta: { type: "text_delta", text: "mocked-transit" },
  })}`,
  "",
  "event: content_block_stop",
  `data: ${JSON.stringify({ type: "content_block_stop", index: 0 })}`,
  "",
  "event: message_delta",
  `data: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: 2 },
  })}`,
  "",
  "event: message_stop",
  `data: ${JSON.stringify({ type: "message_stop" })}`,
  "",
  "",
].join("\n");

afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function bodyText(body: BodyInit | null | undefined): Promise<string> {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof URLSearchParams) return body.toString();
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
  if (typeof (body as Blob).text === "function") return (body as Blob).text();
  return String(body);
}

function installFetch(provider: "sse" | "fail" | "forbidden" = "sse") {
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const body = await bodyText(init?.body);
    fetchCalls.push({ url, init, body });
    if (provider === "forbidden") {
      throw new Error(`network called for rejected request: ${url}`);
    }
    if (url.includes("api.anthropic.com")) {
      if (provider === "fail") {
        return new Response(JSON.stringify({ error: { message: SECRET } }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    const name = url.split("?")[0]?.split("/").pop() ?? "";
    const text = await readFile(new URL(`../data/${name}`, import.meta.url), "utf8");
    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

function request(authorization: string | null, body: string) {
  let read = false;
  const req = new Request("http://localhost/api/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization === null ? {} : { authorization }),
    },
    body,
  });
  const original = req.json.bind(req);
  req.json = async () => {
    read = true;
    return original();
  };
  return { req, wasRead: () => read };
}

const validBody = JSON.stringify({
  messages: [{ role: "user", content: USER_TEXT }],
});

function outbound(): string {
  return fetchCalls
    .map((call) => {
      const headers = call.init?.headers;
      const headerText =
        headers instanceof Headers
          ? [...headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n")
          : JSON.stringify(headers ?? {});
      return `${call.url}\n${headerText}\n${call.body}`;
    })
    .join("\n");
}

test("missing header is 401 and does no parse, fetch, or provider work", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  process.env.ANTHROPIC_API_KEY = PROVIDER_KEY;
  installFetch("forbidden");
  const { req, wasRead } = request(null, validBody);
  const res = await POST(req);
  const text = await res.text();
  assert.equal(res.status, 401);
  assert.equal(text, "unauthorized");
  assert.equal(text.includes(SECRET), false);
  assert.equal(wasRead(), false);
  assert.equal(fetchCalls.length, 0);
});

test("wrong, malformed, wrong-scheme, and different-length tokens are 401", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  process.env.ANTHROPIC_API_KEY = PROVIDER_KEY;
  const headers = [
    `Bearer ${"x".repeat(SECRET.length)}`,
    "Bearer",
    "Bearer ",
    `Basic ${SECRET}`,
    `bearer ${SECRET}`,
    `Token ${SECRET}`,
    SECRET,
    `Bearer ${SECRET}x`,
    `Bearer ${SECRET.slice(0, -1)}`,
  ];
  for (const authorization of headers) {
    installFetch("forbidden");
    const { req, wasRead } = request(authorization, validBody);
    const res = await POST(req);
    const text = await res.text();
    assert.equal(res.status, 401, authorization);
    assert.equal(text, "unauthorized");
    assert.equal(text.includes(SECRET), false);
    assert.equal(wasRead(), false);
    assert.equal(fetchCalls.length, 0);
  }
});

test("unset, empty, and whitespace tokens fail closed with 503", async () => {
  process.env.ANTHROPIC_API_KEY = PROVIDER_KEY;
  for (const value of [undefined, "", "   ", "\n"] as const) {
    if (value === undefined) delete process.env.CHAT_ACCESS_TOKEN;
    else process.env.CHAT_ACCESS_TOKEN = value;
    installFetch("forbidden");
    const { req, wasRead } = request(`Bearer ${SECRET}`, validBody);
    const res = await POST(req);
    const text = await res.text();
    assert.equal(res.status, 503, JSON.stringify(value));
    assert.equal(text, "chat unavailable");
    assert.equal(text.includes(SECRET), false);
    assert.equal(wasRead(), false);
    assert.equal(fetchCalls.length, 0);
  }
});

test("invalid messages after auth do not reach fetch or the provider", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  const bodies = [
    "not-json",
    JSON.stringify({}),
    JSON.stringify({ messages: [] }),
    JSON.stringify({ messages: { role: "user", content: "hi" } }),
    JSON.stringify({ messages: [{ role: "system", content: "hi" }] }),
    JSON.stringify({ messages: [{ role: "user", content: 5 }] }),
    JSON.stringify({ messages: [{ role: "user" }] }),
  ];
  for (const body of bodies) {
    installFetch("forbidden");
    const { req, wasRead } = request(`Bearer ${SECRET}`, body);
    const res = await POST(req);
    const text = await res.text();
    assert.equal(res.status, 400, body);
    assert.equal(text, "messages required");
    assert.equal(text.includes(SECRET), false);
    assert.equal(wasRead(), true);
    assert.equal(fetchCalls.length, 0);
  }
});

test("a valid authorized request streams the mocked provider text", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  process.env.ANTHROPIC_API_KEY = PROVIDER_KEY;
  installFetch("sse");
  const { req } = request(`Bearer ${SECRET}`, validBody);
  const res = await POST(req);
  const text = await res.text();
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /text\/plain/);
  assert.equal(text, "mocked-transit");
  assert.equal(text.includes(SECRET), false);
  const provider = fetchCalls.filter((call) => call.url.includes("api.anthropic.com"));
  const context = fetchCalls.filter((call) => call.url.includes("raw.githubusercontent.com"));
  assert.equal(provider.length, 1);
  assert.equal(context.length, 3);
  assert.equal(provider[0]?.body.includes(SECRET), false);
  assert.equal(provider[0]?.body.includes(USER_TEXT), true);
  assert.equal(outbound().includes(SECRET), false);
  const headerDump = headerText(provider[0]?.init?.headers);
  assert.equal(headerDump.includes(SECRET), false);
  assert.equal(headerDump.includes(PROVIDER_KEY), true, headerDump);
});

function headerText(headers: RequestInit["headers"] | undefined): string {
  if (!headers) return "";
  if (headers instanceof Headers) {
    return [...headers.entries()].map(([key, value]) => `${key}: ${value}`).join("\n");
  }
  if (Array.isArray(headers)) {
    return headers.map(([key, value]) => `${key}: ${value}`).join("\n");
  }
  return Object.entries(headers).map(([key, value]) => `${key}: ${String(value)}`).join("\n");
}

test("a provider failure does not echo the access token", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  process.env.ANTHROPIC_API_KEY = PROVIDER_KEY;
  installFetch("fail");
  const { req } = request(`Bearer ${SECRET}`, validBody);
  const res = await POST(req);
  const text = await res.text();
  assert.equal(text.includes(SECRET), false);
  assert.match(text, /\[error\]/);
});

test("a missing provider key after authorization does not fetch", async () => {
  process.env.CHAT_ACCESS_TOKEN = SECRET;
  delete process.env.ANTHROPIC_API_KEY;
  installFetch("forbidden");
  const { req } = request(`Bearer ${SECRET}`, validBody);
  const res = await POST(req);
  const text = await res.text();
  assert.equal(res.status, 500);
  assert.equal(text, "chat unavailable");
  assert.equal(text.includes(SECRET), false);
  assert.equal(fetchCalls.length, 0);
});
