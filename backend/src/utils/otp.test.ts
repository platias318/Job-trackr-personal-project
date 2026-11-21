import crypto from "crypto";
import { describe, expect, it, vi } from "vitest";

import {
  codesMatch,
  generateCode,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_COOLDOWN_SECONDS,
  OTP_TTL_MINUTES,
} from "./otp.js";

describe("generateCode", () => {
  it("always returns exactly 6 digits", () => {
    for (let i = 0; i < 500; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("asks for the full 100000-999999 range (upper bound is exclusive)", () => {
    const spy = vi.spyOn(crypto, "randomInt");

    generateCode();

    expect(spy).toHaveBeenCalledWith(100000, 1_000_000);
  });

  it("can produce both ends of the range", () => {
    const spy = vi.spyOn(crypto, "randomInt");
    const returning = (n: number) => (() => n) as unknown as typeof crypto.randomInt;

    spy.mockImplementationOnce(returning(100000));
    expect(generateCode()).toBe("100000");

    spy.mockImplementationOnce(returning(999999));
    expect(generateCode()).toBe("999999");
  });
});

describe("codesMatch", () => {
  it("matches identical codes", () => {
    expect(codesMatch("123456", "123456")).toBe(true);
  });

  it("rejects a different code of the same length", () => {
    expect(codesMatch("123456", "123457")).toBe(false);
  });

  it("rejects codes of different lengths without throwing", () => {
    // crypto.timingSafeEqual throws on unequal lengths, so this guards that path
    expect(codesMatch("123456", "12345")).toBe(false);
    expect(codesMatch("123456", "1234567")).toBe(false);
    expect(codesMatch("123456", "")).toBe(false);
  });

  it("is not tricked by leading zeros or whitespace", () => {
    expect(codesMatch("012345", "12345")).toBe(false);
    expect(codesMatch("123456", "123456 ")).toBe(false);
  });
});

describe("OTP limits", () => {
  it("keeps the resend cooldown shorter than the code lifetime", () => {
    // send-code builds its SQL window as TTL - cooldown; it must stay positive
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBeGreaterThan(0);
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBeLessThan(OTP_TTL_MINUTES * 60);
  });

  it("allows a small, positive number of guesses", () => {
    expect(OTP_MAX_ATTEMPTS).toBeGreaterThan(0);
    // 6 digits = 900,000 codes; this keeps brute-forcing hopeless
    expect(OTP_MAX_ATTEMPTS).toBeLessThanOrEqual(10);
  });
});
