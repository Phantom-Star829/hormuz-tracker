import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const SECRET = "chat-access-sentinel-do-not-ship";
const originalFetch = globalThis.fetch;
const writes: string[] = [];
const logs: string[] = [];

const storage = {
  getItem() {
    return null;
  },
  setItem(key: string, value: string) {
    writes.push(`${key}=${value}`);
  },
  removeItem() {},
  clear() {},
  key() {
    return null;
  },
  get length() {
    return writes.length;
  },
};

Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });

for (const method of ["log", "info", "debug", "warn", "error"] as const) {
  console[method] = (...args: unknown[]) => {
    logs.push(args.map((arg) => String(arg)).join(" "));
  };
}

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("the client source does not store or embed the access token", async () => {
  const src = await readFile(new URL("../components/Chat.tsx", import.meta.url), "utf8");
  for (const forbidden of [
    "localStorage",
    "sessionStorage",
    "NEXT_PUBLIC_",
    "CHAT_ACCESS_TOKEN",
    SECRET,
    "document.cookie",
  ]) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
  assert.match(src, /type="password"/);
  assert.match(src, /autoComplete="off"/);
});

test("the token stays in memory and is sent only as a bearer header", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response("answer", { status: 200 });
  }) as typeof fetch;

  const { default: Chat } = await import("../components/Chat");
  let renderer!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    renderer = TestRenderer.create(React.createElement(Chat));
  });

  const suggestion = () =>
    renderer.root.findAllByType("button").find((node) => node.children.includes("Why are transits down?"));

  await act(async () => {
    await suggestion()?.props.onClick();
  });
  assert.equal(calls.length, 0);
  assert.match(JSON.stringify(renderer.toJSON()), /Enter the access token/);

  const password = renderer.root.findAllByType("input").find((node) => node.props.type === "password");
  assert.equal(password?.props.autoComplete, "off");
  assert.equal(password?.props.spellCheck, false);
  await act(async () => {
    password?.props.onChange({ target: { value: SECRET } });
  });

  await act(async () => {
    await suggestion()?.props.onClick();
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, "/api/chat");
  assert.equal(calls[0]?.url.includes(SECRET), false);
  const headers = calls[0]?.init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, `Bearer ${SECRET}`);
  const body = JSON.parse(String(calls[0]?.init?.body));
  assert.deepEqual(Object.keys(body), ["messages"]);
  assert.equal(JSON.stringify(body).includes(SECRET), false);
  assert.equal(writes.length, 0);
  assert.equal(logs.some((line) => line.includes(SECRET)), false);
});
