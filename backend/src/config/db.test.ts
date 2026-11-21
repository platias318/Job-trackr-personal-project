import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  poolQuery: vi.fn(),
  Pool: vi.fn(),
}));

vi.mock("pg", () => ({
  Pool: mocks.Pool,
}));

type Client = { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

let client: Client;

const loadDb = async () => {
  vi.resetModules();
  return import("./db.js");
};

beforeEach(() => {
  client = { query: vi.fn().mockResolvedValue({ rows: [] }), release: vi.fn() };
  mocks.connect.mockResolvedValue(client);
  mocks.Pool.mockImplementation(function () {
    return { connect: mocks.connect, query: mocks.poolQuery };
  });
});

describe("startup configuration", () => {
  it("refuses to start without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(loadDb()).rejects.toThrow("DATABASE_URL is not defined");
  });

  it("builds the pool from DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://example/db");

    await loadDb();

    expect(mocks.Pool).toHaveBeenCalledWith(
      expect.objectContaining({ connectionString: "postgres://example/db" }),
    );
  });

  it("enables SSL only in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await loadDb();
    expect(mocks.Pool.mock.calls.at(-1)?.[0].ssl).toBeTruthy();

    vi.stubEnv("NODE_ENV", "development");
    await loadDb();
    expect(mocks.Pool.mock.calls.at(-1)?.[0].ssl).toBe(false);
  });
});

describe("withTransaction", () => {
  it("runs BEGIN, the callback and COMMIT in order, on one connection", async () => {
    const { withTransaction } = await loadDb();

    const result = await withTransaction(async (c) => {
      await c.query("SELECT 1");
      return "done";
    });

    expect(result).toBe("done");
    expect(client.query.mock.calls.map((call) => call[0])).toEqual([
      "BEGIN",
      "SELECT 1",
      "COMMIT",
    ]);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("rolls back, rethrows the original error and never commits when the callback fails", async () => {
    const { withTransaction } = await loadDb();
    const boom = new Error("boom");

    await expect(
      withTransaction(async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);

    const statements = client.query.mock.calls.map((call) => call[0]);
    expect(statements).toEqual(["BEGIN", "ROLLBACK"]);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("still throws the ORIGINAL error and releases the connection if ROLLBACK itself fails", async () => {
    const { withTransaction } = await loadDb();
    const original = new Error("original failure");
    client.query.mockImplementation(async (sql: string) => {
      if (sql === "ROLLBACK") throw new Error("rollback failed");
      return { rows: [] };
    });

    await expect(
      withTransaction(async () => {
        throw original;
      }),
    ).rejects.toBe(original);

    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the connection and rolls back when COMMIT fails", async () => {
    const { withTransaction } = await loadDb();
    client.query.mockImplementation(async (sql: string) => {
      if (sql === "COMMIT") throw new Error("commit failed");
      return { rows: [] };
    });

    await expect(withTransaction(async () => "x")).rejects.toThrow(
      "commit failed",
    );

    expect(client.query).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  it("releases the connection if BEGIN fails", async () => {
    const { withTransaction } = await loadDb();
    client.query.mockRejectedValueOnce(new Error("cannot begin"));

    await expect(withTransaction(async () => "x")).rejects.toThrow(
      "cannot begin",
    );

    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe("lockUserResource", () => {
  it("takes a transaction-scoped advisory lock keyed by resource and user", async () => {
    const { lockUserResource, USER_LOCK } = await loadDb();

    await lockUserResource(client as never, USER_LOCK.cvs, 42);

    expect(client.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock($1::int, $2::int)",
      [USER_LOCK.cvs, 42],
    );
  });

  it("uses a different lock namespace per resource so they never block each other", async () => {
    const { USER_LOCK } = await loadDb();

    expect(USER_LOCK.applications).not.toBe(USER_LOCK.cvs);
  });
});
