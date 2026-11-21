import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_APPLICATIONS } from "../types/application.types.js";

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  clientQuery: vi.fn(),
  withTransaction: vi.fn(),
  lockUserResource: vi.fn(),
}));

vi.mock("../config/db.js", () => ({
  pool: { query: mocks.poolQuery },
  withTransaction: mocks.withTransaction,
  lockUserResource: mocks.lockUserResource,
  USER_LOCK: { applications: 1, cvs: 2 },
}));

import {
  ApplicationLimitError,
  createApplication,
  deleteApplication,
  getApplicationsByUser,
  updateApplication,
} from "./application.service.js";

const newApplication = {
  company_name: "Acme",
  job_title: "Dev",
  status: "Applied" as const,
  date_applied: "2026-11-01",
};

const countRows = (count: number) => ({ rows: [{ count }] });

beforeEach(() => {
  mocks.withTransaction.mockImplementation(
    async (fn: (client: unknown) => unknown) =>
      fn({ query: mocks.clientQuery }),
  );
});

describe("getApplicationsByUser", () => {
  it("queries only the given user, newest first, and returns the rows", async () => {
    const rows = [{ id: 1 }, { id: 2 }];
    mocks.poolQuery.mockResolvedValue({ rows });

    await expect(getApplicationsByUser(7)).resolves.toBe(rows);

    const [sql, params] = mocks.poolQuery.mock.calls[0];
    expect(sql).toContain("WHERE user_id = $1");
    expect(sql).toContain("ORDER BY date_applied DESC");
    expect(params).toEqual([7]);
  });
});

describe("createApplication", () => {
  it("takes the per-user lock BEFORE counting, then inserts", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(0))
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await createApplication(7, newApplication);

    expect(mocks.lockUserResource).toHaveBeenCalledWith(
      expect.anything(),
      1, // USER_LOCK.applications
      7,
    );
    expect(mocks.lockUserResource.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clientQuery.mock.invocationCallOrder[0],
    );
  });

  it("runs inside a single transaction", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(0))
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await createApplication(7, newApplication);

    expect(mocks.withTransaction).toHaveBeenCalledTimes(1);
    expect(mocks.poolQuery).not.toHaveBeenCalled();
  });

  it("inserts the payload in column order and returns the new row", async () => {
    const row = { id: 11, ...newApplication };
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(3))
      .mockResolvedValueOnce({ rows: [row] });

    const result = await createApplication(7, {
      ...newApplication,
      job_link: "https://example.com/job",
      linkedin_link: "https://linkedin.com/x",
      notes: "hello",
      follow_up_date: "2026-11-08",
    });

    expect(result).toBe(row);
    const [sql, params] = mocks.clientQuery.mock.calls[1];
    expect(sql).toContain("INSERT INTO applications");
    expect(params).toEqual([
      7,
      "Acme",
      "Dev",
      "Applied",
      "2026-11-01",
      "https://example.com/job",
      "https://linkedin.com/x",
      "hello",
      "2026-11-08",
    ]);
  });

  it("stores omitted optional fields as NULL", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(0))
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await createApplication(7, newApplication);

    expect(mocks.clientQuery.mock.calls[1][1].slice(5)).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it("allows creating the last free slot (limit - 1 existing)", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(MAX_APPLICATIONS - 1))
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await expect(createApplication(7, newApplication)).resolves.toEqual({
      id: 1,
    });
  });

  it("rejects at the limit with ApplicationLimitError and never inserts", async () => {
    mocks.clientQuery.mockResolvedValueOnce(countRows(MAX_APPLICATIONS));

    const attempt = createApplication(7, newApplication);

    await expect(attempt).rejects.toBeInstanceOf(ApplicationLimitError);
    await expect(attempt).rejects.toThrow(
      `maximum of ${MAX_APPLICATIONS} applications`,
    );
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1); // only the COUNT
  });

  it("propagates database errors so the transaction rolls back", async () => {
    mocks.clientQuery.mockRejectedValueOnce(new Error("db down"));

    await expect(createApplication(7, newApplication)).rejects.toThrow(
      "db down",
    );
  });
});

describe("updateApplication", () => {
  // Parameter positions in the UPDATE statement
  const FLAG = { job_link: 4, linkedin_link: 6, notes: 8, follow_up_date: 10 };
  const VALUE = { job_link: 5, linkedin_link: 7, notes: 9, follow_up_date: 11 };

  it("scopes the update to the application AND the user", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 3 }] });

    await updateApplication(3, 7, { status: "Interview" });

    const params = mocks.poolQuery.mock.calls[0][1];
    expect(params[12]).toBe(3);
    expect(params[13]).toBe(7);
    expect(mocks.poolQuery.mock.calls[0][0]).toContain(
      "WHERE id = $13 AND user_id = $14",
    );
  });

  it("leaves nullable columns untouched when they are omitted", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 3 }] });

    await updateApplication(3, 7, { status: "Interview" });

    const params = mocks.poolQuery.mock.calls[0][1];
    for (const field of Object.keys(FLAG) as (keyof typeof FLAG)[]) {
      expect(params[FLAG[field]]).toBe(false);
    }
  });

  it("clears a nullable column only when null is sent explicitly", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 3 }] });

    await updateApplication(3, 7, {
      job_link: null,
      linkedin_link: null,
      notes: null,
      follow_up_date: null,
    });

    const params = mocks.poolQuery.mock.calls[0][1];
    for (const field of Object.keys(FLAG) as (keyof typeof FLAG)[]) {
      expect(params[FLAG[field]]).toBe(true);
      expect(params[VALUE[field]]).toBeNull();
    }
  });

  it("sets nullable columns to the provided value", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 3 }] });

    await updateApplication(3, 7, {
      job_link: "https://example.com",
      follow_up_date: "2026-12-01",
    });

    const params = mocks.poolQuery.mock.calls[0][1];
    expect(params[FLAG.job_link]).toBe(true);
    expect(params[VALUE.job_link]).toBe("https://example.com");
    expect(params[FLAG.follow_up_date]).toBe(true);
    expect(params[VALUE.follow_up_date]).toBe("2026-12-01");
    expect(params[FLAG.notes]).toBe(false);
  });

  it("passes required columns through for COALESCE", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [{ id: 3 }] });

    await updateApplication(3, 7, {
      company_name: "New Co",
      job_title: "New Title",
      status: "Offer",
      date_applied: "2026-10-10",
    });

    expect(mocks.poolQuery.mock.calls[0][1].slice(0, 4)).toEqual([
      "New Co",
      "New Title",
      "Offer",
      "2026-10-10",
    ]);
  });

  it("returns the updated row", async () => {
    const row = { id: 3, status: "Offer" };
    mocks.poolQuery.mockResolvedValue({ rows: [row] });

    await expect(updateApplication(3, 7, { status: "Offer" })).resolves.toBe(
      row,
    );
  });

  it("returns null when nothing matched (missing or someone else's)", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await expect(updateApplication(3, 7, {})).resolves.toBeNull();
  });
});

describe("deleteApplication", () => {
  it("deletes by id and user and reports success", async () => {
    mocks.poolQuery.mockResolvedValue({ rowCount: 1 });

    await expect(deleteApplication(3, 7)).resolves.toBe(true);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining("WHERE id = $1 AND user_id = $2"),
      [3, 7],
    );
  });

  it.each([[0], [null]])("reports failure when rowCount is %j", async (rowCount) => {
    mocks.poolQuery.mockResolvedValue({ rowCount });

    await expect(deleteApplication(3, 7)).resolves.toBe(false);
  });
});
