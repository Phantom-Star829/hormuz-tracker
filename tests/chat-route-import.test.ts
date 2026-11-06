import assert from "node:assert/strict";
import { test } from "node:test";

// The Anthropic SDK refuses to construct in a browser-like environment.
// A module-scope client would throw here and the route could not return 401.
Object.defineProperty(globalThis, "window", {
  value: { document: {} },
  configurable: true,
  writable: true,
});

delete process.env.ANTHROPIC_API_KEY;
process.env.CHAT_ACCESS_TOKEN = "chat-access-sentinel-do-not-ship";

test("importing the route does not construct the provider", async () => {
  const { POST } = await import("../app/api/chat/route");
  const res = await POST(
    new Request("http://localhost/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }),
    }),
  );
  assert.equal(res.status, 401);
  assert.equal(await res.text(), "unauthorized");
});
