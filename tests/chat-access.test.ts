import assert from "node:assert/strict";
import { test } from "node:test";
import { authorizeChat, tokensEqual } from "../app/api/chat/access";

const SECRET = "chat-access-sentinel-do-not-ship";

test("equal utf-8 strings match, including multibyte characters", () => {
  assert.equal(tokensEqual("alpha-token", "alpha-token"), true);
  assert.equal(tokensEqual("tökén", "tökén"), true);
  assert.equal(tokensEqual("éé", "éé"), true);
});

test("nfc and nfd are not treated as the same token", () => {
  const nfc = "é";
  const nfd = "e\u0301";
  assert.notEqual(Buffer.from(nfc, "utf8").length, 0);
  assert.equal(tokensEqual(nfc, nfd), false);
});

test("length mismatches and lone surrogates do not match and do not throw", () => {
  assert.doesNotThrow(() => {
    assert.equal(tokensEqual("abc", "abcd"), false);
    assert.equal(tokensEqual("abcd", "abc"), false);
    assert.equal(tokensEqual("", "a"), false);
    assert.equal(tokensEqual("a", ""), false);
    assert.equal(tokensEqual("aaaa", "éé"), false);
    assert.equal(tokensEqual("\uD800", SECRET), false);
    assert.equal(tokensEqual(SECRET, "\uD800"), false);
  });
});

test("same-length different bytes do not match", () => {
  assert.equal(tokensEqual("abcdef", "abcdeg"), false);
  assert.equal(tokensEqual("éé", "aaaa"), false);
});

test("missing or blank configured token fails closed", () => {
  for (const configured of [undefined, "", "   ", "\n", "\t"]) {
    const decision = authorizeChat(`Bearer ${SECRET}`, configured);
    assert.deepEqual(decision, { ok: false, status: 503 });
  }
});

test("a configured token rejects missing, malformed, wrong-scheme, and mismatched bearers", () => {
  const cases = [
    null,
    "",
    "Bearer",
    "Bearer ",
    `Basic ${SECRET}`,
    `bearer ${SECRET}`,
    `Token ${SECRET}`,
    SECRET,
    `Bearer ${SECRET} `,
    `Bearer  ${SECRET}`,
    `Bearer ${SECRET}x`,
    `Bearer ${SECRET.slice(0, -1)}`,
    `Bearer ${"x".repeat(SECRET.length)}`,
    `Bearer \uD800`,
    `Bearer ${"é".repeat(SECRET.length)}`,
  ];
  for (const header of cases) {
    const decision = authorizeChat(header, SECRET);
    assert.deepEqual(decision, { ok: false, status: 401 }, `header ${JSON.stringify(header)}`);
  }
});

test("an exact bearer token is authorized", () => {
  assert.deepEqual(authorizeChat(`Bearer ${SECRET}`, SECRET), { ok: true });
  assert.deepEqual(authorizeChat("Bearer tökén", "tökén"), { ok: true });
});
