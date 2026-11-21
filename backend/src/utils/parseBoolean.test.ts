import { describe, expect, it } from "vitest";

import { parseBoolean } from "./parseBoolean.js";

describe("parseBoolean", () => {
  it("accepts a real boolean true (JSON bodies)", () => {
    expect(parseBoolean(true)).toBe(true);
  });

  it('accepts the string "true" (multipart form fields)', () => {
    expect(parseBoolean("true")).toBe(true);
  });

  it.each([
    false,
    "false",
    "",
    "TRUE",
    "yes",
    "1",
    1,
    0,
    null,
    undefined,
    {},
    [],
  ])("treats %j as false", (value) => {
    expect(parseBoolean(value)).toBe(false);
  });
});
