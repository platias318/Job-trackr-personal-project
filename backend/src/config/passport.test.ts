import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  use: vi.fn(),
  Strategy: vi.fn(),
}));

vi.mock("../config/db.js", () => ({ pool: { query: mocks.query } }));
vi.mock("passport", () => ({ default: { use: mocks.use } }));
vi.mock("passport-google-oauth20", () => ({ Strategy: mocks.Strategy }));

type Verify = (
  accessToken: string,
  refreshToken: string,
  profile: unknown,
  cb: (err: unknown, user?: unknown) => void,
) => Promise<void>;

const profile = {
  id: "google-123",
  displayName: "Test User",
  emails: [{ value: "test@example.com" }],
};

let options: Record<string, string>;
let verify: Verify;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-id");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "client-secret");
  vi.stubEnv("BACKEND_URL", "https://api.example.com");

  mocks.Strategy.mockImplementation(function (opts, fn) {
    options = opts;
    verify = fn;
  });

  await import("./passport.js");
});

describe("Google strategy registration", () => {
  it('registers a strategy named "google"', () => {
    expect(mocks.use).toHaveBeenCalledWith("google", expect.anything());
  });

  it("points Google back at the documented callback route", () => {
    expect(options.callbackURL).toBe(
      "https://api.example.com/api/auth/google/secrets",
    );
    expect(options.clientID).toBe("client-id");
    expect(options.clientSecret).toBe("client-secret");
  });
});

describe("Google verify callback", () => {
  it("signs in an existing user found by google_id or email, without inserting", async () => {
    const existing = { id: 9, email: "test@example.com" };
    mocks.query.mockResolvedValueOnce({ rows: [existing] });
    const cb = vi.fn();

    await verify("at", "rt", profile, cb);

    expect(mocks.query).toHaveBeenCalledTimes(1);
    expect(mocks.query).toHaveBeenCalledWith(
      expect.stringContaining("google_id = $1 OR email = $2"),
      ["google-123", "test@example.com"],
    );
    expect(cb).toHaveBeenCalledWith(null, existing);
  });

  it("creates a new user from the Google profile when none exists", async () => {
    const created = { id: 10, email: "test@example.com" };
    mocks.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [created] });
    const cb = vi.fn();

    await verify("at", "rt", profile, cb);

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(mocks.query.mock.calls[1][0]).toContain("INSERT INTO users");
    expect(mocks.query.mock.calls[1][1]).toEqual([
      "test@example.com",
      "Test User",
      "google-123",
    ]);
    expect(cb).toHaveBeenCalledWith(null, created);
  });

  it("passes database failures to the callback instead of throwing", async () => {
    const failure = new Error("db down");
    mocks.query.mockRejectedValueOnce(failure);
    const cb = vi.fn();

    await verify("at", "rt", profile, cb);

    expect(cb).toHaveBeenCalledWith(failure);
  });
});
