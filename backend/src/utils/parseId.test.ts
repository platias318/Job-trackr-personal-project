import { describe, expect, it } from "vitest";

import { parseId } from "./parseId.js";

describe("parseId", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["2147483647", 2147483647], // largest Postgres INTEGER
  ])("accepts %s", (input, expected) => {
    expect(parseId(input)).toBe(expected);
  });

  it.each([
    ["an empty string", ""],
    ["zero", "0"],
    ["a negative number", "-1"],
    ["trailing characters (parseInt would accept this as 12)", "12abc"],
    ["leading characters", "abc12"],
    ["a decimal", "1.5"],
    ["scientific notation", "1e3"],
    ["a leading zero", "007"],
    ["whitespace", " 7"],
    ["a plus sign", "+7"],
    ["a value above the database INTEGER range", "2147483648"],
    ["a huge number", "99999999999999999999999"],
  ])("rejects %s", (_label, input) => {
    expect(parseId(input)).toBeNull();
  });
});
