import { act, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("@/services/auth.service", () => ({
  authService: { getCurrentUser: mocks.getCurrentUser, logout: mocks.logout },
}));

import { useAuth, useAuthBootstrap } from "./useAuth";

const user = { id: 1, email: "a@b.com", name: "A" };

const goTo = (path: string) => window.history.pushState({}, "", path);

beforeEach(() => {
  vi.clearAllMocks();
  goTo("/");
});

describe("useAuthBootstrap", () => {
  it("asks the API who is signed in and stores the user", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);

    const { store } = renderHookWithProviders(() => useAuthBootstrap(), {
      auth: { isAuthLoading: true },
    });

    await waitFor(() =>
      expect(store.getState().common).toEqual({
        user,
        isUserAuthenticated: true,
        isAuthLoading: false,
      }),
    );
  });

  it("clears the user (and stops loading) when there is no valid session", async () => {
    mocks.getCurrentUser.mockRejectedValue(new Error("401"));

    const { store } = renderHookWithProviders(() => useAuthBootstrap(), {
      auth: { isAuthLoading: true },
    });

    await waitFor(() =>
      expect(store.getState().common).toEqual({
        user: null,
        isUserAuthenticated: false,
        isAuthLoading: false,
      }),
    );
  });

  it("does not check the session on /auth/callback (that page sets it up itself)", () => {
    goTo("/auth/callback");

    const { store } = renderHookWithProviders(() => useAuthBootstrap(), {
      auth: { isAuthLoading: true },
    });

    expect(mocks.getCurrentUser).not.toHaveBeenCalled();
    expect(store.getState().common.isAuthLoading).toBe(true);
  });

  it("ignores a late answer after the component unmounted", async () => {
    let resolve!: (u: typeof user) => void;
    mocks.getCurrentUser.mockReturnValue(new Promise((r) => (resolve = r)));

    const { store, unmount } = renderHookWithProviders(() => useAuthBootstrap(), {
      auth: { isAuthLoading: true },
    });
    unmount();
    await act(async () => {
      resolve(user);
    });

    expect(store.getState().common.user).toBeNull();
  });
});

describe("useAuth", () => {
  it("exposes the user, authentication state and loading state from the store", () => {
    const { result } = renderHookWithProviders(() => useAuth(), {
      auth: { user, isUserAuthenticated: true, isAuthLoading: false },
    });

    expect(result.current).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it("logout calls the API, clears the user and returns to the home page", async () => {
    mocks.logout.mockResolvedValue(undefined);
    const location = { href: "/dashboard", pathname: "/dashboard" };
    vi.stubGlobal("location", location);
    const { result, store } = renderHookWithProviders(() => useAuth(), {
      auth: { user, isUserAuthenticated: true },
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(mocks.logout).toHaveBeenCalled();
    expect(store.getState().common.user).toBeNull();
    expect(store.getState().common.isUserAuthenticated).toBe(false);
    expect(location.href).toBe("/");
  });

  it("logout keeps the user signed in if the API call fails", async () => {
    mocks.logout.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { result, store } = renderHookWithProviders(() => useAuth(), {
      auth: { user, isUserAuthenticated: true },
    });

    await act(async () => {
      await result.current.logout();
    });

    expect(store.getState().common.isUserAuthenticated).toBe(true);
  });
});
