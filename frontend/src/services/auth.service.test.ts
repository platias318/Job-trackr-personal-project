import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: api }));

import { authService } from "./auth.service";

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue({ data: {} });
  api.post.mockResolvedValue({ data: {} });
});

describe("authService", () => {
  it("exchange sends the OAuth code to the exchange endpoint", async () => {
    await authService.exchange("abc.def.ghi");

    expect(api.get).toHaveBeenCalledWith("/api/auth/exchange?code=abc.def.ghi");
  });

  it("getCurrentUser returns the user from the response", async () => {
    const user = { id: 1, email: "a@b.com", name: "A" };
    api.get.mockResolvedValue({ data: { user } });

    await expect(authService.getCurrentUser()).resolves.toBe(user);
    expect(api.get).toHaveBeenCalledWith("/api/auth/me");
  });

  it("getCurrentUser rejects when the session is invalid (so the app can clear the user)", async () => {
    api.get.mockRejectedValue(new Error("401"));

    await expect(authService.getCurrentUser()).rejects.toThrow("401");
  });

  it("sendCode posts the email", async () => {
    await authService.sendCode("a@b.com");

    expect(api.post).toHaveBeenCalledWith("/api/auth/email/send-code", {
      email: "a@b.com",
    });
  });

  it("verifyCode posts the email and the code", async () => {
    await authService.verifyCode("a@b.com", "123456");

    expect(api.post).toHaveBeenCalledWith("/api/auth/email/verify-code", {
      email: "a@b.com",
      code: "123456",
    });
  });

  it("logout posts to the logout endpoint", async () => {
    await authService.logout();

    expect(api.post).toHaveBeenCalledWith("/api/auth/logout");
  });
});
