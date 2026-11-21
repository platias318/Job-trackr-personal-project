import type { NextFunction, Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { signExchangeToken, signToken } from "../utils/jwt.js";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));

vi.mock("../config/db.js", () => ({ pool: { query: mocks.query } }));

import { isAuthenticated } from "./authMiddleware.js";

const user = { id: 5, email: "user@example.com", name: "User" };

const run = async (cookies?: Record<string, string>) => {
  const req = { cookies } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as unknown as NextFunction;

  await isAuthenticated(req, res, next);

  return { req, res, next };
};

beforeEach(() => {
  mocks.query.mockResolvedValue({ rows: [user] });
});

describe("isAuthenticated", () => {
  it("lets a valid session through and attaches the user", async () => {
    const { req, res, next } = await run({ token: signToken(user.id) });

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
    expect(req.user).toEqual(user);
    expect(mocks.query).toHaveBeenCalledWith(expect.stringContaining("FROM users"), [
      user.id,
    ]);
  });

  it.each([
    ["no cookies object at all", undefined],
    ["an empty cookie jar", {}],
    ["an empty token", { token: "" }],
  ])("returns 401 for %s", async (_label, cookies) => {
    const { res, next } = await run(cookies);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "User not authenticated" });
    expect(next).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 401 for a malformed or forged token, without touching the database", async () => {
    const { res, next } = await run({ token: "not.a.jwt" });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects the short-lived OAuth exchange token used as a session cookie", async () => {
    const { res, next } = await run({ token: signExchangeToken(user.id) });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("returns 401 when the user no longer exists (deleted account)", async () => {
    mocks.query.mockResolvedValue({ rows: [] });

    const { res, next } = await run({ token: signToken(user.id) });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 (and does not crash) if the database lookup fails", async () => {
    mocks.query.mockRejectedValue(new Error("db down"));

    const { res, next } = await run({ token: signToken(user.id) });

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
