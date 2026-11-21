import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeApplication } from "@/test/factories";
import { MAX_APPLICATIONS } from "@/types/application.types";

const service = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/services/application.service", () => ({ applicationService: service }));

import { useApplications } from "./useApplications";

const payload = {
  company_name: "Acme",
  job_title: "Dev",
  status: "Applied" as const,
  date_applied: "2026-11-01",
};

const setup = async (initial = [makeApplication({ id: 1 }), makeApplication({ id: 2 })]) => {
  service.getAll.mockResolvedValue(initial);
  const hook = renderHook(() => useApplications());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loading", () => {
  it("starts in the loading state, then exposes the applications", async () => {
    service.getAll.mockResolvedValue([makeApplication({ id: 1 })]);

    const { result } = renderHook(() => useApplications());

    expect(result.current.loading).toBe(true);
    expect(result.current.applications).toEqual([]);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.applications).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it("reports an error (and stops loading) when the request fails", async () => {
    service.getAll.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useApplications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load applications.");
    expect(result.current.applications).toEqual([]);
  });

  it("refetch clears a previous error and reloads", async () => {
    service.getAll.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useApplications());
    await waitFor(() => expect(result.current.error).not.toBeNull());

    service.getAll.mockResolvedValueOnce([makeApplication({ id: 9 })]);
    await act(async () => {
      await result.current.refetch();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.applications.map((a) => a.id)).toEqual([9]);
  });
});

describe("create / update / remove", () => {
  it("create puts the new application first", async () => {
    const { result } = await setup();
    service.create.mockResolvedValue(makeApplication({ id: 3 }));

    await act(async () => {
      await result.current.create(payload);
    });

    expect(service.create).toHaveBeenCalledWith(payload);
    expect(result.current.applications.map((a) => a.id)).toEqual([3, 1, 2]);
  });

  it("create leaves the list untouched and rethrows when the API refuses", async () => {
    const { result } = await setup();
    service.create.mockRejectedValue(new Error("limit reached"));

    await expect(
      act(async () => {
        await result.current.create(payload);
      }),
    ).rejects.toThrow("limit reached");

    expect(result.current.applications.map((a) => a.id)).toEqual([1, 2]);
  });

  it("update replaces only the matching application", async () => {
    const { result } = await setup();
    service.update.mockResolvedValue(makeApplication({ id: 2, status: "Offer" }));

    await act(async () => {
      await result.current.update(2, { status: "Offer" });
    });

    expect(service.update).toHaveBeenCalledWith(2, { status: "Offer" });
    expect(result.current.applications.map((a) => [a.id, a.status])).toEqual([
      [1, "Applied"],
      [2, "Offer"],
    ]);
  });

  it("remove drops the application from the list", async () => {
    const { result } = await setup();
    service.delete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.remove(1);
    });

    expect(service.delete).toHaveBeenCalledWith(1);
    expect(result.current.applications.map((a) => a.id)).toEqual([2]);
  });

  it("remove keeps the application if the API call fails", async () => {
    const { result } = await setup();
    service.delete.mockRejectedValue(new Error("nope"));

    await expect(
      act(async () => {
        await result.current.remove(1);
      }),
    ).rejects.toThrow("nope");

    expect(result.current.applications).toHaveLength(2);
  });
});

describe("limit", () => {
  it("exposes the limit", async () => {
    const { result } = await setup([]);

    expect(result.current.limit).toBe(MAX_APPLICATIONS);
  });

  it("is not at the limit one application below it", async () => {
    const apps = Array.from({ length: MAX_APPLICATIONS - 1 }, (_, i) =>
      makeApplication({ id: i + 1 }),
    );
    const { result } = await setup(apps);

    expect(result.current.atLimit).toBe(false);
  });

  it("is at the limit when full", async () => {
    const apps = Array.from({ length: MAX_APPLICATIONS }, (_, i) =>
      makeApplication({ id: i + 1 }),
    );
    const { result } = await setup(apps);

    expect(result.current.atLimit).toBe(true);
  });
});

describe("filterByStatus", () => {
  it("returns everything for 'All' and only the matching status otherwise", async () => {
    const { result } = await setup([
      makeApplication({ id: 1, status: "Applied" }),
      makeApplication({ id: 2, status: "Interview" }),
    ]);

    expect(result.current.filterByStatus("All")).toHaveLength(2);
    expect(result.current.filterByStatus("Interview").map((a) => a.id)).toEqual([2]);
    expect(result.current.filterByStatus("Offer")).toEqual([]);
  });
});
