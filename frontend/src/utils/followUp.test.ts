import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeApplication } from "@/test/factories";
import type { ApplicationStatus } from "@/types/application.types";

import {
  addDaysString,
  dateOnly,
  daysBetween,
  DEFAULT_FOLLOW_UP_DAYS,
  FOLLOW_UP_STATUSES,
  getDueFollowUps,
  getFollowUpInfo,
  OPEN_STATUSES,
  todayString,
} from "./followUp";

// Local time on purpose: these helpers work with the user's calendar day.
const setNow = (y: number, m: number, d: number, h = 12, min = 0) =>
  vi.setSystemTime(new Date(y, m - 1, d, h, min, 0));

beforeEach(() => {
  vi.useFakeTimers();
  setNow(2026, 11, 14);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("constants", () => {
  it("only offers follow-up suggestions for statuses that are still open", () => {
    for (const status of FOLLOW_UP_STATUSES) {
      expect(OPEN_STATUSES).toContain(status);
    }
  });

  it("suggests a follow-up a week out", () => {
    expect(DEFAULT_FOLLOW_UP_DAYS).toBe(7);
  });
});

describe("todayString", () => {
  it("formats the local date as YYYY-MM-DD", () => {
    expect(todayString()).toBe("2026-11-14");
  });

  it("uses the LOCAL day, not the UTC day (00:30 in Athens is still the previous day in UTC)", () => {
    setNow(2026, 11, 14, 0, 30);

    expect(new Date().toISOString().startsWith("2026-11-13")).toBe(true);
    expect(todayString()).toBe("2026-11-14");
  });

  it("zero-pads single-digit months and days", () => {
    setNow(2026, 3, 5);

    expect(todayString()).toBe("2026-03-05");
  });
});

describe("addDaysString", () => {
  it.each([
    [0, "2026-11-14"],
    [7, "2026-11-21"],
    [-1, "2026-11-13"],
    [17, "2026-12-01"], // month rollover
    [47, "2026-12-31"],
    [48, "2027-01-01"], // year rollover
  ])("adds %i days", (days, expected) => {
    expect(addDaysString(days)).toBe(expected);
  });

  it("handles leap days", () => {
    setNow(2028, 2, 28);

    expect(addDaysString(1)).toBe("2028-02-29");
    expect(addDaysString(2)).toBe("2028-03-01");
  });

  it("stays correct across the autumn DST change (25-hour day, 25 Oct 2026)", () => {
    setNow(2026, 10, 24);

    expect(addDaysString(1)).toBe("2026-10-25");
    expect(addDaysString(2)).toBe("2026-10-26");
    expect(addDaysString(7)).toBe("2026-10-31");
  });

  it("stays correct across the spring DST change (23-hour day, 29 Mar 2026)", () => {
    setNow(2026, 3, 28);

    expect(addDaysString(1)).toBe("2026-03-29");
    expect(addDaysString(2)).toBe("2026-03-30");
  });
});

describe("dateOnly", () => {
  it("strips the time from the API's ISO strings", () => {
    expect(dateOnly("2026-10-24T00:00:00.000Z")).toBe("2026-10-24");
  });

  it("leaves a plain date alone", () => {
    expect(dateOnly("2026-10-24")).toBe("2026-10-24");
  });

  it.each([null, undefined, ""])("returns an empty string for %j", (value) => {
    expect(dateOnly(value)).toBe("");
  });
});

describe("daysBetween", () => {
  it.each([
    ["2026-11-14", "2026-11-14", 0],
    ["2026-11-14", "2026-11-15", 1],
    ["2026-11-14", "2026-11-13", -1],
    ["2026-11-14", "2026-12-14", 30],
    ["2026-12-30", "2027-01-02", 3],
    ["2028-02-28", "2028-03-01", 2], // leap year
    ["2027-02-28", "2027-03-01", 1], // non-leap year
  ])("%s -> %s is %i days", (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });

  it("counts whole calendar days across a DST change", () => {
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(2);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("getFollowUpInfo", () => {
  const info = (
    follow_up_date: string | null,
    status: ApplicationStatus = "Applied",
    today = "2026-11-14",
  ) =>
    getFollowUpInfo({ status, follow_up_date }, today);

  it("is overdue when the date has passed, and reports how many days late", () => {
    expect(info("2026-11-11")).toEqual({
      state: "overdue",
      date: "2026-11-11",
      daysLate: 3,
      daysLeft: 0,
    });
  });

  it("is due 'today' on the day itself", () => {
    expect(info("2026-11-14")).toEqual({
      state: "today",
      date: "2026-11-14",
      daysLate: 0,
      daysLeft: 0,
    });
  });

  it.each([
    ["2026-11-15", "soon", 1],
    ["2026-11-16", "soon", 2],
    ["2026-11-17", "upcoming", 3],
    ["2027-01-01", "upcoming", 48],
  ])("%s is %s (%i days left)", (date, state, daysLeft) => {
    expect(info(date)).toMatchObject({ state, daysLeft, daysLate: 0 });
  });

  it("understands the API's ISO timestamps", () => {
    expect(info("2026-11-16T00:00:00.000Z")).toMatchObject({
      state: "soon",
      date: "2026-11-16",
    });
  });

  it("returns null when there is no follow-up date", () => {
    expect(info(null)).toBeNull();
    expect(info("")).toBeNull();
  });

  it.each(OPEN_STATUSES)("tracks follow-ups for the open status %s", (status) => {
    expect(info("2026-11-10", status)).not.toBeNull();
  });

  it.each(["Accepted", "Rejected", "Ghosted", "Withdrawn"] as const)(
    "ignores follow-ups for the closed status %s",
    (status) => {
      expect(info("2026-11-10", status)).toBeNull();
    },
  );

  it("uses today's real date when none is passed", () => {
    expect(
      getFollowUpInfo({ status: "Applied", follow_up_date: "2026-11-14" }),
    ).toMatchObject({ state: "today" });
  });
});

describe("getDueFollowUps", () => {
  it("returns only open applications that are overdue or due today, most overdue first", () => {
    const apps = [
      makeApplication({ id: 1, follow_up_date: "2026-11-14" }), // today
      makeApplication({ id: 2, follow_up_date: "2026-11-01" }), // 13 days late
      makeApplication({ id: 3, follow_up_date: "2026-11-16" }), // soon
      makeApplication({ id: 4, follow_up_date: "2026-12-01" }), // upcoming
      makeApplication({ id: 5, follow_up_date: null }), // none
      makeApplication({ id: 6, follow_up_date: "2026-11-01", status: "Rejected" }), // closed
      makeApplication({ id: 7, follow_up_date: "2026-11-10", status: "Interview" }), // 4 late
    ];

    const due = getDueFollowUps(apps);

    expect(due.map((x) => x.app.id)).toEqual([2, 7, 1]);
    expect(due.map((x) => x.info.state)).toEqual(["overdue", "overdue", "today"]);
  });

  it("returns an empty list when nothing is due", () => {
    expect(getDueFollowUps([])).toEqual([]);
    expect(
      getDueFollowUps([makeApplication({ follow_up_date: "2027-01-01" })]),
    ).toEqual([]);
  });
});
