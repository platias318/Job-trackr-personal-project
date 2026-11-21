import { describe, expect, it } from "vitest";

import { normalizeEmail } from "./validateEmail.js";

describe("normalizeEmail", () => {
  it("returns a valid email unchanged", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });

  it("trims whitespace and lower-cases", () => {
    expect(normalizeEmail("  MiXeD.Case@Example.COM \n")).toBe(
      "mixed.case@example.com",
    );
  });

  it("keeps plus-addressing and subdomains", () => {
    expect(normalizeEmail("a+tag@mail.example.co.uk")).toBe(
      "a+tag@mail.example.co.uk",
    );
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { email: "a@b.com" }],
    ["an empty string", ""],
    ["only whitespace", "   "],
    ["no @", "userexample.com"],
    ["no local part", "@example.com"],
    ["no domain", "user@"],
    ["no dot in the domain", "user@localhost"],
    ["a space inside", "us er@example.com"],
    ["two @ signs", "a@b@example.com"],
  ])("rejects %s", (_label, value) => {
    expect(normalizeEmail(value)).toBeNull();
  });

  it("accepts an address of exactly 254 characters and rejects 255", () => {
    const domain = "@example.com"; // 12 chars
    const atLimit = "a".repeat(254 - domain.length) + domain;
    const overLimit = "a".repeat(255 - domain.length) + domain;

    expect(atLimit).toHaveLength(254);
    expect(normalizeEmail(atLimit)).toBe(atLimit);
    expect(normalizeEmail(overLimit)).toBeNull();
  });
});
