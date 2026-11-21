import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ThemeProvider } from "@/context/ThemeProvider";

import { useThemeMode } from "./useThemeMode";

const setup = () => renderHook(() => useThemeMode(), { wrapper: ThemeProvider });

describe("theme mode", () => {
  it("defaults to light", () => {
    const { result } = setup();

    expect(result.current.isDark).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });

  it("restores a saved dark preference", () => {
    localStorage.setItem("theme", "dark");

    const { result } = setup();

    expect(result.current.isDark).toBe(true);
  });

  it("treats an unknown saved value as light", () => {
    localStorage.setItem("theme", "purple");

    expect(setup().result.current.isDark).toBe(false);
  });

  it("toggles and remembers the choice", () => {
    const { result } = setup();

    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    act(() => result.current.toggleTheme());
    expect(result.current.isDark).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
  });
});
