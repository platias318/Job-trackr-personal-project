import jwt from "jsonwebtoken";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  signExchangeToken,
  signToken,
  verifyExchangeToken,
  verifyToken,
} from "./jwt.js";

const SECRET = process.env.JWT_SECRET as string;

const decode = (token: string) =>
  jwt.decode(token) as { id: number; purpose?: string; iat: number; exp: number };

describe("session tokens", () => {
  it("round-trips the user id", () => {
    expect(verifyToken(signToken(7))).toEqual({ id: 7 });
  });

  it("lasts 24 hours and carries no purpose claim", () => {
    const payload = decode(signToken(7));

    expect(payload.exp - payload.iat).toBe(24 * 60 * 60);
    expect(payload.purpose).toBeUndefined();
  });

  it("is rejected by verifyExchangeToken", () => {
    expect(() => verifyExchangeToken(signToken(7))).toThrow();
  });
});

describe("exchange tokens", () => {
  it("round-trips the user id", () => {
    expect(verifyExchangeToken(signExchangeToken(7))).toEqual({ id: 7 });
  });

  it("lasts only 60 seconds and is marked with a purpose", () => {
    const payload = decode(signExchangeToken(7));

    expect(payload.exp - payload.iat).toBe(60);
    expect(payload.purpose).toBe("oauth-exchange");
  });

  it("can NOT be used as a session token", () => {
    expect(() => verifyToken(signExchangeToken(7))).toThrow(
      "Not a session token",
    );
  });

  it("rejects any token with a different purpose", () => {
    const other = jwt.sign({ id: 7, purpose: "something-else" }, SECRET);

    expect(() => verifyExchangeToken(other)).toThrow("Not an exchange token");
    expect(() => verifyToken(other)).toThrow("Not a session token");
  });
});

describe("expiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("exchange token: valid at 59s, expired after 61s", () => {
    const token = signExchangeToken(1);

    vi.advanceTimersByTime(59_000);
    expect(verifyExchangeToken(token)).toEqual({ id: 1 });

    vi.advanceTimersByTime(2_000);
    expect(() => verifyExchangeToken(token)).toThrow(/expired/i);
  });

  it("session token: valid just under 24h, expired after", () => {
    const token = signToken(1);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000 - 1000);
    expect(verifyToken(token)).toEqual({ id: 1 });

    vi.advanceTimersByTime(2_000);
    expect(() => verifyToken(token)).toThrow(/expired/i);
  });
});

describe("forged and tampered tokens", () => {
  it("rejects a token signed with another secret", () => {
    const forged = jwt.sign({ id: 1 }, "not-the-real-secret");
    expect(() => verifyToken(forged)).toThrow();
  });

  it("rejects a token whose payload was edited", () => {
    const [header, , signature] = signToken(1).split(".");
    const payload = Buffer.from(JSON.stringify({ id: 999 })).toString(
      "base64url",
    );

    expect(() => verifyToken(`${header}.${payload}.${signature}`)).toThrow();
  });

  it('rejects an unsigned token ("alg": "none")', () => {
    const unsigned = jwt.sign({ id: 1 }, "", { algorithm: "none" });
    expect(() => verifyToken(unsigned)).toThrow();
  });

  it("rejects a token using a different HMAC algorithm (algorithm is pinned)", () => {
    const hs512 = jwt.sign({ id: 1 }, SECRET, { algorithm: "HS512" });

    expect(() => verifyToken(hs512)).toThrow(/invalid algorithm/i);
  });

  it.each(["", "garbage", "a.b.c"])("rejects malformed input %j", (token) => {
    expect(() => verifyToken(token)).toThrow();
  });
});

describe("missing JWT_SECRET", () => {
  it("fails loudly instead of signing with an empty secret", () => {
    vi.stubEnv("JWT_SECRET", "");

    expect(() => signToken(1)).toThrow("JWT_SECRET is not defined");
    expect(() => signExchangeToken(1)).toThrow("JWT_SECRET is not defined");
    expect(() => verifyToken("a.b.c")).toThrow("JWT_SECRET is not defined");
  });
});
