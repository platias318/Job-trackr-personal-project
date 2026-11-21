import { describe, expect, it } from "vitest";

import { makeApplication } from "@/test/factories";
import {
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from "@/types/application.types";

import {
  filterAndSortApplications,
  SORT_OPTIONS,
  type SortOption,
  STAGE_RANK,
} from "./applicationList";

const list = (
  applications: ReturnType<typeof makeApplication>[],
  options: Partial<{ status: ApplicationStatus | "All"; query: string; sort: SortOption }> = {},
) =>
  filterAndSortApplications(applications, {
    status: "All",
    query: "",
    sort: "newest",
    ...options,
  });

const ids = (applications: ReturnType<typeof makeApplication>[]) =>
  applications.map((a) => a.id);

describe("status filter", () => {
  const apps = [
    makeApplication({ id: 1, status: "Applied" }),
    makeApplication({ id: 2, status: "Interview" }),
    makeApplication({ id: 3, status: "Applied" }),
  ];

  it("keeps everything for 'All'", () => {
    expect(list(apps)).toHaveLength(3);
  });

  it("keeps only the chosen status", () => {
    expect(ids(list(apps, { status: "Applied", sort: "oldest" })).sort()).toEqual([1, 3]);
    expect(ids(list(apps, { status: "Interview" }))).toEqual([2]);
  });

  it("returns an empty list when no application has the status", () => {
    expect(list(apps, { status: "Offer" })).toEqual([]);
  });
});

describe("search", () => {
  const apps = [
    makeApplication({ id: 1, company_name: "Acme", job_title: "Backend Engineer", notes: "Referred by Maria" }),
    makeApplication({ id: 2, company_name: "Globex", job_title: "Frontend Developer", notes: null }),
    makeApplication({ id: 3, company_name: "Café Digital", job_title: "QA", notes: "" }),
    makeApplication({ id: 4, company_name: "Αθήνα Soft", job_title: "Μηχανικός Λογισμικού", notes: null }),
    makeApplication({ id: 5, company_name: "ΟΔΥΣΣΕΥΣ AE", job_title: "Dev", notes: null }),
  ];
  const search = (query: string) => ids(list(apps, { query, sort: "oldest" })).sort();

  it("matches the company name", () => {
    expect(search("acme")).toEqual([1]);
  });

  it("matches the job title", () => {
    expect(search("frontend")).toEqual([2]);
  });

  it("matches the notes", () => {
    expect(search("maria")).toEqual([1]);
  });

  it("is case-insensitive", () => {
    expect(search("GLOBEX")).toEqual([2]);
  });

  it("ignores accents in both directions", () => {
    expect(search("cafe")).toEqual([3]);
    expect(search("CAFÉ")).toEqual([3]);
  });

  it("ignores Greek accents and tonos", () => {
    expect(search("αθηνα")).toEqual([4]);
    expect(search("ΑΘΉΝΑ")).toEqual([4]);
    expect(search("μηχανικος")).toEqual([4]);
  });

  it("handles the Greek final sigma (ΟΔΥΣΣΕΥΣ lower-cases to οδυσσευς)", () => {
    expect(search("οδυσσευς")).toEqual([5]);
  });

  it("trims the query", () => {
    expect(search("  acme  ")).toEqual([1]);
  });

  it.each(["", "   "])("treats %j as no filter", (query) => {
    expect(search(query)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns nothing when there is no match", () => {
    expect(search("zzz")).toEqual([]);
  });

  it("copes with null and empty notes", () => {
    expect(() => search("anything")).not.toThrow();
  });

  it("combines with the status filter", () => {
    const mixed = [
      makeApplication({ id: 1, company_name: "Acme", status: "Applied" }),
      makeApplication({ id: 2, company_name: "Acme", status: "Offer" }),
    ];

    expect(ids(list(mixed, { query: "acme", status: "Offer" }))).toEqual([2]);
  });
});

describe("sorting", () => {
  it("newest: latest date_applied first, ties broken by created_at", () => {
    const apps = [
      makeApplication({ id: 1, date_applied: "2026-10-01T00:00:00.000Z" }),
      makeApplication({ id: 2, date_applied: "2026-11-01T00:00:00.000Z", created_at: "2026-11-01T08:00:00.000Z" }),
      makeApplication({ id: 3, date_applied: "2026-11-01T00:00:00.000Z", created_at: "2026-11-01T10:00:00.000Z" }),
    ];

    expect(ids(list(apps, { sort: "newest" }))).toEqual([3, 2, 1]);
  });

  it("oldest is the exact reverse of newest", () => {
    const apps = [
      makeApplication({ id: 1, date_applied: "2026-10-01T00:00:00.000Z" }),
      makeApplication({ id: 2, date_applied: "2026-11-01T00:00:00.000Z", created_at: "2026-11-01T08:00:00.000Z" }),
      makeApplication({ id: 3, date_applied: "2026-11-01T00:00:00.000Z", created_at: "2026-11-01T10:00:00.000Z" }),
    ];

    expect(ids(list(apps, { sort: "oldest" }))).toEqual([1, 2, 3]);
  });

  describe("by stage", () => {
    const apps = APPLICATION_STATUSES.map((status, i) =>
      makeApplication({ id: i + 1, status }),
    );

    it("stageFar puts the furthest stage first", () => {
      expect(list(apps, { sort: "stageFar" }).map((a) => a.status)).toEqual([
        "Accepted",
        "Offer",
        "Technical Test",
        "Interview",
        "Applied",
        "Rejected",
        "Ghosted",
        "Withdrawn",
      ]);
    });

    it("stageEarly is the reverse order", () => {
      expect(list(apps, { sort: "stageEarly" }).map((a) => a.status)).toEqual([
        "Withdrawn",
        "Ghosted",
        "Rejected",
        "Applied",
        "Interview",
        "Technical Test",
        "Offer",
        "Accepted",
      ]);
    });

    it("breaks ties within a stage by newest first", () => {
      const sameStage = [
        makeApplication({ id: 1, status: "Interview", date_applied: "2026-10-01T00:00:00.000Z" }),
        makeApplication({ id: 2, status: "Interview", date_applied: "2026-11-01T00:00:00.000Z" }),
      ];

      expect(ids(list(sameStage, { sort: "stageFar" }))).toEqual([2, 1]);
    });

    it("ranks every status exactly once", () => {
      const ranks = Object.values(STAGE_RANK);

      expect(Object.keys(STAGE_RANK).sort()).toEqual([...APPLICATION_STATUSES].sort());
      expect(new Set(ranks).size).toBe(ranks.length);
    });
  });

  describe("followUp", () => {
    it("puts the soonest follow-up first and applications without one last", () => {
      const apps = [
        makeApplication({ id: 1, follow_up_date: null, date_applied: "2026-11-05T00:00:00.000Z" }),
        makeApplication({ id: 2, follow_up_date: "2026-12-10T00:00:00.000Z" }),
        makeApplication({ id: 3, follow_up_date: "2026-11-20" }),
        makeApplication({ id: 4, follow_up_date: null, date_applied: "2026-11-09T00:00:00.000Z" }),
      ];

      // dated ones soonest-first, then the undated ones newest-first
      expect(ids(list(apps, { sort: "followUp" }))).toEqual([3, 2, 4, 1]);
    });

    it("breaks equal follow-up dates by newest application", () => {
      const apps = [
        makeApplication({ id: 1, follow_up_date: "2026-11-20", date_applied: "2026-10-01T00:00:00.000Z" }),
        makeApplication({ id: 2, follow_up_date: "2026-11-20", date_applied: "2026-11-01T00:00:00.000Z" }),
      ];

      expect(ids(list(apps, { sort: "followUp" }))).toEqual([2, 1]);
    });
  });

  it("offers a sort option for every comparator", () => {
    const apps = [makeApplication(), makeApplication()];

    for (const sort of SORT_OPTIONS) {
      expect(() => list(apps, { sort })).not.toThrow();
    }
    expect(SORT_OPTIONS).toEqual(["newest", "oldest", "stageFar", "stageEarly", "followUp"]);
  });
});

describe("immutability", () => {
  it("never reorders or mutates the array it was given", () => {
    const apps = [
      makeApplication({ id: 1, date_applied: "2026-10-01T00:00:00.000Z" }),
      makeApplication({ id: 2, date_applied: "2026-11-01T00:00:00.000Z" }),
    ];
    const snapshot = [...apps];

    list(apps, { sort: "newest" });

    expect(apps).toEqual(snapshot);
  });
});
