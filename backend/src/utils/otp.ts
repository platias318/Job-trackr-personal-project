import crypto from "crypto";

export const OTP_TTL_MINUTES = 10;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const OTP_MAX_ATTEMPTS = 5;

// 6 digits, 100000-999999. randomInt's upper bound is exclusive.
export const generateCode = (): string => {
  return crypto.randomInt(100000, 1_000_000).toString();
};

// Constant-time comparison so response timing never reveals how many leading
// digits of a guess were correct.
export const codesMatch = (expected: string, received: string): boolean => {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
