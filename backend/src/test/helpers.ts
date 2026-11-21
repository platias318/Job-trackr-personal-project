import cookieParser from "cookie-parser";
import express, { Express, Router } from "express";

import { signToken } from "../utils/jwt.js";

// The user the mocked database returns for the auth middleware's lookup.
export const TEST_USER = { id: 7, email: "user@example.com", name: "Test User" };

// A valid session cookie for `userId`, signed with the test JWT secret.
export const authCookie = (userId: number = TEST_USER.id): string =>
  `token=${signToken(userId)}`;

// Mounts one router the same way app.ts does (JSON + cookies), without the
// CORS / Passport / database wiring, so route tests stay small and focused.
export const createTestApp = (mountPath: string, router: Router): Express => {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(mountPath, router);
  return app;
};

// Extracts the Set-Cookie header lines as a single searchable string.
export const setCookieOf = (res: { headers: Record<string, unknown> }): string =>
  ([] as string[]).concat((res.headers["set-cookie"] as string[]) ?? []).join("\n");
