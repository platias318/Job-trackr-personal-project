import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeApplication } from "@/test/factories";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/types/application.types";

import { computeStats, WEEKS_SHOWN } from "./stats";

// Wednesday 18 Nov 2026 -> the current week starts on Monday 16 Nov.
const TODAY = "2026-11-18";

const app = (status: ApplicationStatus, extra = {}) =>
  makeApplication({ status, ...extra });

const appliedOn = (date: string) =>
  makeApplication({ date_applied: `${date}T00:00:00.000Z` });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("empty input", () => {
  it("returns zeros (and never NaN) when there are no applications", () => {
    const stats = computeStats([], TODAY);

    expect(stats).toMatchObject({
      total: 0,
      active: 0,
      responded: 0,
      reachedInterview: 0,
      offers: 0,
      responseRate: 0,
      interviewRate: 0,
      followUpsDue: 0,
    });
    expect(Object.values(stats.byStatus).every((n) => n === 0)).toBe(true);
    expect(stats.weekly.every((w) => w.count === 0)).toBe(true);
  });
});

describe("counts", () => {
  const apps = [
    app("Applied"),
    app("Applied"),
    app("Interview"),
    app("Technical Test"),
    app("Offer"),
    app("Accepted"),
    app("Rejected"),
    app("Ghosted"),
    app("Withdrawn"),
  ];
  const stats = computeStats(apps, TODAY);

  it("counts the total and each status", () => {
    expect(stats.total).toBe(9);
    expect(stats.byStatus).toEqual({
      Applied: 2,
      Interview: 1,
      "Technical Test": 1,
      Offer: 1,
      Accepted: 1,
      Rejected: 1,
      Ghosted: 1,
      Withdrawn: 1,
    });
  });

  it("has an entry for every status, even with no applications", () => {
    expect(Object.keys(computeStats([], TODAY).byStatus).sort()).toEqual(
      [...APPLICATION_STATUSES].sort(),
    );
  });

  it("counts 'active' as the still-open statuses (Applied, Interview, Technical Test, Offer)", () => {
    expect(stats.active).toBe(5);
  });

  it("counts a response as anything past 'Applied' except Ghosted / Withdrawn", () => {
    // Interview, Technical Test, Offer, Accepted, Rejected
    expect(stats.responded).toBe(5);
  });

  it("counts 'reached interview' as Interview, Technical Test, Offer and Accepted — a rejection does not count", () => {
    expect(stats.reachedInterview).toBe(4);
  });

  it("counts offers as Offer + Accepted", () => {
    expect(stats.offers).toBe(2);
  });
});

describe("rates", () => {
  it("are percentages of the total, rounded to whole numbers", () => {
    const stats = computeStats(
      [app("Interview"), app("Applied"), app("Applied")],
      TODAY,
    );

    expect(stats.responseRate).toBe(33); // 1/3
    expect(stats.interviewRate).toBe(33);
  });

  it("rounds half up (2 of 3 is 67)", () => {
    const stats = computeStats(
      [app("Interview"), app("Offer"), app("Applied")],
      TODAY,
    );

    expect(stats.responseRate).toBe(67);
  });

  it("can reach 100", () => {
    expect(computeStats([app("Offer")], TODAY).responseRate).toBe(100);
  });

  it("separates 'responded' from 'reached interview' for rejections", () => {
    const stats = computeStats([app("Rejected"), app("Applied")], TODAY);

    expect(stats.responseRate).toBe(50);
    expect(stats.interviewRate).toBe(0);
  });
});

describe("follow-ups due", () => {
  it("counts open applications that are overdue or due today (using today's date)", () => {
    const stats = computeStats(
      [
        app("Applied", { follow_up_date: "2026-11-10" }), // overdue
        app("Interview", { follow_up_date: "2026-11-18" }), // today
        app("Applied", { follow_up_date: "2026-11-25" }), // later
        app("Rejected", { follow_up_date: "2026-11-01" }), // closed
        app("Applied"), // none
      ],
      TODAY,
    );

    expect(stats.followUpsDue).toBe(2);
  });
});

describe("weekly buckets", () => {
  const weekStarts = (today = TODAY) =>
    computeStats([], today).weekly.map((w) => w.weekStart);

  const countFor = (date: string, today = TODAY) =>
    computeStats([appliedOn(date)], today).weekly.map((w) => w.count);

  it("shows the last 8 weeks, oldest first, each starting on a Monday", () => {
    const starts = weekStarts();

    expect(starts).toHaveLength(WEEKS_SHOWN);
    expect(starts).toEqual([
      "2026-09-28",
      "2026-10-05",
      "2026-10-12",
      "2026-10-19",
      "2026-10-26",
      "2026-11-02",
      "2026-11-09",
      "2026-11-16",
    ]);
    for (const start of starts) {
      expect(new Date(`${start}T00:00:00Z`).getUTCDay()).toBe(1);
    }
  });

  it.each([
    ["Monday", "2026-11-16"],
    ["Sunday", "2026-11-22"],
    ["Wednesday", "2026-11-18"],
  ])("puts the current week at the end when today is a %s (%s)", (_day, today) => {
    expect(weekStarts(today).at(-1)).toBe("2026-11-16");
  });

  it("puts an application from Monday into that Monday's week", () => {
    expect(countFor("2026-11-16")).toEqual([0, 0, 0, 0, 0, 0, 0, 1]);
  });

  it("puts an application from the Sunday before into the previous week", () => {
    expect(countFor("2026-11-15")).toEqual([0, 0, 0, 0, 0, 0, 1, 0]);
  });

  it("includes the first day of the oldest week shown", () => {
    expect(countFor("2026-09-28")).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
  });

  it("ignores applications older than the window", () => {
    expect(countFor("2026-09-27").every((n) => n === 0)).toBe(true);
    expect(countFor("2025-01-01").every((n) => n === 0)).toBe(true);
  });

  it("ignores applications dated after the current week", () => {
    expect(countFor("2026-11-23").every((n) => n === 0)).toBe(true);
  });

  it("is not thrown off by the DST change on Sunday 25 Oct 2026", () => {
    expect(countFor("2026-10-25")).toEqual([0, 0, 0, 1, 0, 0, 0, 0]); // week of 19 Oct
    expect(countFor("2026-10-26")).toEqual([0, 0, 0, 0, 1, 0, 0, 0]); // week of 26 Oct
  });

  it("handles weeks that span the new year", () => {
    const starts = weekStarts("2027-01-03"); // a Sunday

    expect(starts.at(-1)).toBe("2026-12-28");
    expect(starts).toContain("2026-12-21");
    expect(computeStats([appliedOn("2027-01-01")], "2027-01-03").weekly.at(-1)?.count).toBe(1);
  });

  it("accepts plain dates as well as ISO timestamps", () => {
    const stats = computeStats(
      [makeApplication({ date_applied: "2026-11-17" })],
      TODAY,
    );

    expect(stats.weekly.at(-1)?.count).toBe(1);
  });

  it("skips applications that have no date", () => {
    const stats = computeStats([makeApplication({ date_applied: "" })], TODAY);

    expect(stats.weekly.every((w) => w.count === 0)).toBe(true);
    expect(stats.total).toBe(1);
  });

  it("adds up several applications in the same week", () => {
    const stats = computeStats(
      [appliedOn("2026-11-16"), appliedOn("2026-11-18"), appliedOn("2026-11-22")],
      TODAY,
    );

    expect(stats.weekly.at(-1)?.count).toBe(3);
  });
});
