import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeCV } from "@/test/factories";
import { MAX_CVS } from "@/types/cv.types";

const service = vi.hoisted(() => ({
  getAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/services/cv.service", () => ({ cvService: service }));

import { useCVs } from "./useCVs";

const file = new File(["%PDF-"], "cv.pdf", { type: "application/pdf" });

const setup = async (initial = [makeCV({ id: 1 })]) => {
  service.getAll.mockResolvedValue(initial);
  const hook = renderHook(() => useCVs());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("loading", () => {
  it("loads the CVs", async () => {
    const { result } = await setup([makeCV({ id: 1 }), makeCV({ id: 2 })]);

    expect(result.current.cvs).toHaveLength(2);
    expect(result.current.count).toBe(2);
    expect(result.current.error).toBeNull();
  });

  it("reports an error when loading fails", async () => {
    service.getAll.mockRejectedValue(new Error("network"));

    const { result } = renderHook(() => useCVs());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.error).toBe("Failed to load CVs.");
  });
});

describe("mutations", () => {
  it("create puts the new CV first", async () => {
    const { result } = await setup();
    service.create.mockResolvedValue(makeCV({ id: 7 }));

    await act(async () => {
      await result.current.create({ file, name: "New" });
    });

    expect(result.current.cvs.map((c) => c.id)).toEqual([7, 1]);
  });

  it("update replaces the matching CV", async () => {
    const { result } = await setup([makeCV({ id: 1 }), makeCV({ id: 2 })]);
    service.update.mockResolvedValue(makeCV({ id: 2, name: "Renamed" }));

    await act(async () => {
      await result.current.update(2, { name: "Renamed" });
    });

    expect(result.current.cvs.find((c) => c.id === 2)?.name).toBe("Renamed");
    expect(result.current.cvs).toHaveLength(2);
  });

  it("remove drops the CV", async () => {
    const { result } = await setup([makeCV({ id: 1 }), makeCV({ id: 2 })]);
    service.delete.mockResolvedValue(undefined);

    await act(async () => {
      await result.current.remove(1);
    });

    expect(result.current.cvs.map((c) => c.id)).toEqual([2]);
  });

  it("create rethrows API errors (such as the size limit) and keeps the list", async () => {
    const { result } = await setup();
    service.create.mockRejectedValue(new Error("The PDF must be smaller than 1 MB"));

    await expect(
      act(async () => {
        await result.current.create({ file, name: "Big" });
      }),
    ).rejects.toThrow("smaller than 1 MB");

    expect(result.current.cvs).toHaveLength(1);
  });
});

describe("limit", () => {
  it("is not at the limit below MAX_CVS and is at the limit when full", async () => {
    const below = await setup(Array.from({ length: MAX_CVS - 1 }, (_, i) => makeCV({ id: i + 1 })));
    expect(below.result.current.atLimit).toBe(false);
    expect(below.result.current.limit).toBe(MAX_CVS);

    const full = await setup(Array.from({ length: MAX_CVS }, (_, i) => makeCV({ id: i + 1 })));
    expect(full.result.current.atLimit).toBe(true);
  });
});
