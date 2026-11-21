import { describe, expect, it } from "vitest";

import {
  APPLICATION_STATUSES,
  CreateApplicationPayload,
} from "../types/application.types.js";
import {
  validateCreateApplication,
  validateUpdateApplication,
} from "./validateApplication.js";

const validPayload = (
  overrides: Partial<CreateApplicationPayload> = {},
): CreateApplicationPayload => ({
  company_name: "Acme",
  job_title: "Junior Developer",
  status: "Applied",
  date_applied: "2026-11-01",
  ...overrides,
});

describe("validateCreateApplication", () => {
  it("accepts a minimal valid payload", () => {
    expect(validateCreateApplication(validPayload())).toBeNull();
  });

  it("accepts a fully populated payload", () => {
    expect(
      validateCreateApplication(
        validPayload({
          job_link: "https://example.com/job",
          linkedin_link: "https://linkedin.com/jobs/1",
          notes: "Referred by a friend",
          follow_up_date: "2026-11-08",
        }),
      ),
    ).toBeNull();
  });

  it.each(["company_name", "job_title", "status", "date_applied"] as const)(
    "rejects a payload missing %s",
    (field) => {
      const payload = validPayload({ [field]: "" } as Partial<
        CreateApplicationPayload
      >);
      expect(validateCreateApplication(payload)).toBe("Missing required fields");
    },
  );

  it.each([...APPLICATION_STATUSES])("accepts the status %s", (status) => {
    expect(validateCreateApplication(validPayload({ status }))).toBeNull();
  });

  it("rejects an unknown status", () => {
    const payload = validPayload({
      status: "Hired" as CreateApplicationPayload["status"],
    });
    expect(validateCreateApplication(payload)).toBe("Invalid status");
  });

  it("is case-sensitive about the status", () => {
    const payload = validPayload({
      status: "applied" as CreateApplicationPayload["status"],
    });
    expect(validateCreateApplication(payload)).toBe("Invalid status");
  });

  describe("notes length", () => {
    it("accepts exactly 500 characters", () => {
      expect(
        validateCreateApplication(validPayload({ notes: "a".repeat(500) })),
      ).toBeNull();
    });

    it("rejects 501 characters", () => {
      expect(
        validateCreateApplication(validPayload({ notes: "a".repeat(501) })),
      ).toBe("Notes too long");
    });
  });

  describe("follow-up date", () => {
    it.each([undefined, null, ""])("treats %j as 'no follow-up'", (value) => {
      expect(
        validateCreateApplication(validPayload({ follow_up_date: value })),
      ).toBeNull();
    });

    it("accepts a real calendar date", () => {
      expect(
        validateCreateApplication(validPayload({ follow_up_date: "2026-12-31" })),
      ).toBeNull();
    });

    it("accepts 29 February in a leap year", () => {
      expect(
        validateCreateApplication(validPayload({ follow_up_date: "2028-02-29" })),
      ).toBeNull();
    });

    it.each([
      ["a date that does not exist (30 Feb)", "2026-02-30"],
      ["29 Feb in a non-leap year", "2027-02-29"],
      ["month 13", "2026-13-01"],
      ["day 00", "2026-05-00"],
      ["missing zero padding", "2026-2-3"],
      ["a slash-separated date", "2026/02/03"],
      ["an ISO datetime", "2026-02-03T10:00:00Z"],
      ["free text", "tomorrow"],
    ])("rejects %s", (_label, value) => {
      expect(
        validateCreateApplication(validPayload({ follow_up_date: value })),
      ).toBe("Invalid follow-up date");
    });
  });

  it("reports missing fields before any other problem", () => {
    const payload = validPayload({
      company_name: "",
      status: "Nope" as CreateApplicationPayload["status"],
      notes: "a".repeat(600),
    });
    expect(validateCreateApplication(payload)).toBe("Missing required fields");
  });
});

describe("validateUpdateApplication", () => {
  it("accepts an empty update (every field is optional)", () => {
    expect(validateUpdateApplication({})).toBeNull();
  });

  it("accepts a partial update", () => {
    expect(
      validateUpdateApplication({ status: "Interview", notes: "Went well" }),
    ).toBeNull();
  });

  it("rejects an unknown status", () => {
    expect(
      validateUpdateApplication({
        status: "Hired" as CreateApplicationPayload["status"],
      }),
    ).toBe("Invalid status");
  });

  it("rejects notes over 500 characters", () => {
    expect(validateUpdateApplication({ notes: "a".repeat(501) })).toBe(
      "Notes too long",
    );
  });

  it("rejects an impossible follow-up date", () => {
    expect(validateUpdateApplication({ follow_up_date: "2026-02-30" })).toBe(
      "Invalid follow-up date",
    );
  });

  it("allows clearing the follow-up date with null", () => {
    expect(validateUpdateApplication({ follow_up_date: null })).toBeNull();
  });
});
