import { timingSafeEqual } from "node:crypto";

export function tokensEqual(presented: string, expected: string): boolean {
  const presentedBytes = Buffer.from(presented, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const length = Math.max(presentedBytes.length, expectedBytes.length, 1);
  const paddedPresented = Buffer.alloc(length);
  const paddedExpected = Buffer.alloc(length);
  presentedBytes.copy(paddedPresented);
  expectedBytes.copy(paddedExpected);
  const sameBytes = timingSafeEqual(paddedPresented, paddedExpected);
  return sameBytes && presentedBytes.length === expectedBytes.length;
}

const BEARER = "Bearer ";

export function authorizeChat(
  authorization: string | null,
  configuredToken: string | undefined,
): { ok: true } | { ok: false; status: 401 | 503 } {
  if (configuredToken === undefined || configuredToken.trim() === "") {
    return { ok: false, status: 503 };
  }
  if (authorization === null || !authorization.startsWith(BEARER)) {
    return { ok: false, status: 401 };
  }
  const presented = authorization.slice(BEARER.length);
  if (!tokensEqual(presented, configuredToken)) {
    return { ok: false, status: 401 };
  }
  return { ok: true };
}
