import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCookieConsent } from "./useCookieConsent";

describe("useCookieConsent", () => {
  it("is not accepted by default", () => {
    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.accepted).toBe(false);
  });

  it("remembers a previous acceptance", () => {
    localStorage.setItem("cookie-consent", "accepted");

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.accepted).toBe(true);
  });

  it("ignores any stored value other than 'accepted'", () => {
    localStorage.setItem("cookie-consent", "maybe");

    const { result } = renderHook(() => useCookieConsent());

    expect(result.current.accepted).toBe(false);
  });

  it("accept stores the choice and updates the state", () => {
    const { result } = renderHook(() => useCookieConsent());

    act(() => result.current.accept());

    expect(result.current.accepted).toBe(true);
    expect(localStorage.getItem("cookie-consent")).toBe("accepted");
  });

  it("still works when storage is unavailable (private mode, blocked cookies)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    const { result } = renderHook(() => useCookieConsent());
    expect(result.current.accepted).toBe(false);

    act(() => result.current.accept());

    expect(result.current.accepted).toBe(true);
  });
});
