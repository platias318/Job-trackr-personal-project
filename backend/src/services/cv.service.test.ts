import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_CVS } from "../types/cv.types.js";

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
  createCV,
  CVLimitError,
  deleteCV,
  getCVCount,
  getCVsByUser,
  updateCV,
} from "./cv.service.js";

const newCv = {
  name: "Frontend CV",
  version_label: "v2",
  notes: "tailored",
  is_default: false,
  file_url: "https://blob.test/cvs/x/cv.pdf",
};

const countRows = (count: number) => ({ rows: [{ count }] });
const sqlOf = (call: unknown[]) => String(call[0]);

beforeEach(() => {
  mocks.withTransaction.mockImplementation(
    async (fn: (client: unknown) => unknown) =>
      fn({ query: mocks.clientQuery }),
  );
});

describe("getCVsByUser / getCVCount", () => {
  it("lists the user's CVs with the default one first", async () => {
    const rows = [{ id: 1 }];
    mocks.poolQuery.mockResolvedValue({ rows });

    await expect(getCVsByUser(7)).resolves.toBe(rows);

    expect(sqlOf(mocks.poolQuery.mock.calls[0])).toContain(
      "ORDER BY is_default DESC",
    );
    expect(mocks.poolQuery.mock.calls[0][1]).toEqual([7]);
  });

  it("returns the CV count as a number", async () => {
    mocks.poolQuery.mockResolvedValue(countRows(2));

    await expect(getCVCount(7)).resolves.toBe(2);
  });
});

describe("createCV", () => {
  it("takes the per-user CV lock before counting", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(0))
      .mockResolvedValueOnce({ rows: [{ id: 1 }] });

    await createCV(7, newCv);

    expect(mocks.lockUserResource).toHaveBeenCalledWith(
      expect.anything(),
      2, // USER_LOCK.cvs
      7,
    );
    expect(mocks.lockUserResource.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.clientQuery.mock.invocationCallOrder[0],
    );
  });

  it("rejects at the limit with CVLimitError and writes nothing", async () => {
    mocks.clientQuery.mockResolvedValueOnce(countRows(MAX_CVS));

    const attempt = createCV(7, { ...newCv, is_default: true });

    await expect(attempt).rejects.toBeInstanceOf(CVLimitError);
    await expect(attempt).rejects.toThrow(`maximum of ${MAX_CVS} CVs`);
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1); // no un-defaulting, no insert
  });

  it("allows the last free slot", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(MAX_CVS - 1))
      .mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await expect(createCV(7, newCv)).resolves.toEqual({ id: 5 });
  });

  it("inserts the CV in column order and returns it", async () => {
    const row = { id: 5, ...newCv };
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(0))
      .mockResolvedValueOnce({ rows: [row] });

    const result = await createCV(7, newCv);

    expect(result).toBe(row);
    const insert = mocks.clientQuery.mock.calls[1];
    expect(sqlOf(insert)).toContain("INSERT INTO cvs");
    expect(insert[1]).toEqual([
      7,
      "Frontend CV",
      "v2",
      "tailored",
      false,
      "https://blob.test/cvs/x/cv.pdf",
    ]);
  });

  it("does not touch other CVs when the new one is not the default", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(1))
      .mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await createCV(7, { ...newCv, is_default: false });

    const statements = mocks.clientQuery.mock.calls.map(sqlOf);
    expect(statements.some((sql) => sql.includes("is_default = FALSE"))).toBe(
      false,
    );
  });

  it("un-defaults the user's other CVs BEFORE inserting a new default", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce(countRows(1))
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 5 }] });

    await createCV(7, { ...newCv, is_default: true });

    const calls = mocks.clientQuery.mock.calls;
    expect(sqlOf(calls[1])).toContain("SET is_default = FALSE");
    expect(calls[1][1]).toEqual([7]);
    expect(sqlOf(calls[2])).toContain("INSERT INTO cvs");
  });
});

describe("updateCV", () => {
  it("returns null WITHOUT touching any other CV when the id does not exist", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] }); // ownership check

    await expect(updateCV(999, 7, { is_default: true })).resolves.toBeNull();

    // Regression: a PUT for a missing id used to wipe the user's real default
    expect(mocks.clientQuery).toHaveBeenCalledTimes(1);
    expect(sqlOf(mocks.clientQuery.mock.calls[0])).toContain("FOR UPDATE");
  });

  it("checks ownership using both the CV id and the user id", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] });

    await updateCV(3, 7, {});

    expect(mocks.clientQuery.mock.calls[0][1]).toEqual([3, 7]);
  });

  it("takes the CV lock first", async () => {
    mocks.clientQuery.mockResolvedValueOnce({ rows: [] });

    await updateCV(3, 7, {});

    expect(mocks.lockUserResource).toHaveBeenCalledWith(expect.anything(), 2, 7);
  });

  it("un-defaults only the OTHER CVs, then updates the target", async () => {
    const updated = { id: 3, is_default: true };
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 3 }] }) // owned
      .mockResolvedValueOnce({ rows: [] }) // clear others
      .mockResolvedValueOnce({ rows: [updated] }); // update

    await expect(updateCV(3, 7, { is_default: true })).resolves.toBe(updated);

    const calls = mocks.clientQuery.mock.calls;
    expect(sqlOf(calls[1])).toContain("id <> $2");
    expect(calls[1][1]).toEqual([7, 3]);
    expect(sqlOf(calls[2])).toContain("UPDATE cvs");
  });

  it.each([[false], [undefined]])(
    "does not un-default other CVs when is_default is %j",
    async (is_default) => {
      mocks.clientQuery
        .mockResolvedValueOnce({ rows: [{ id: 3 }] })
        .mockResolvedValueOnce({ rows: [{ id: 3 }] });

      await updateCV(3, 7, { name: "Renamed", is_default });

      expect(mocks.clientQuery).toHaveBeenCalledTimes(2); // ownership + update only
    },
  );

  it("passes fields through to COALESCE and scopes the update to the user", async () => {
    mocks.clientQuery
      .mockResolvedValueOnce({ rows: [{ id: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3 }] });

    await updateCV(3, 7, {
      name: "N",
      version_label: "V",
      notes: "T",
      is_default: false,
    });

    expect(mocks.clientQuery.mock.calls[1][1]).toEqual(["N", "V", "T", false, 3, 7]);
  });
});

describe("deleteCV", () => {
  it("reports not-found without a file url", async () => {
    mocks.poolQuery.mockResolvedValue({ rows: [] });

    await expect(deleteCV(3, 7)).resolves.toEqual({
      deleted: false,
      fileUrl: null,
    });
  });

  it("returns the stored file url so the caller can delete the blob", async () => {
    mocks.poolQuery.mockResolvedValue({
      rows: [{ file_url: "https://blob.test/x.pdf" }],
    });

    await expect(deleteCV(3, 7)).resolves.toEqual({
      deleted: true,
      fileUrl: "https://blob.test/x.pdf",
    });
    expect(mocks.poolQuery.mock.calls[0][1]).toEqual([3, 7]);
  });
});
