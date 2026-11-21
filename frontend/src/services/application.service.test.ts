import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeApplication } from "@/test/factories";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: api }));

import { applicationService } from "./application.service";

const apiError = (status: number, data?: unknown) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data,
  });

const payload = {
  company_name: "Acme",
  job_title: "Dev",
  status: "Applied" as const,
  date_applied: "2026-11-01",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAll", () => {
  it("returns the applications array from the response", async () => {
    const applications = [makeApplication(), makeApplication()];
    api.get.mockResolvedValue({ data: { applications } });

    await expect(applicationService.getAll()).resolves.toBe(applications);
    expect(api.get).toHaveBeenCalledWith("/api/applications");
  });
});

describe("create", () => {
  it("posts the payload and returns the created application", async () => {
    const application = makeApplication();
    api.post.mockResolvedValue({ data: { application } });

    await expect(applicationService.create(payload)).resolves.toBe(application);
    expect(api.post).toHaveBeenCalledWith("/api/applications", payload);
  });

  it("surfaces the API's error message (for example the limit message)", async () => {
    api.post.mockRejectedValue(
      apiError(400, { error: "You have reached the maximum of 20 applications" }),
    );

    await expect(applicationService.create(payload)).rejects.toThrow(
      "You have reached the maximum of 20 applications",
    );
  });

  it("falls back to a generic message when the API sent none (network error)", async () => {
    api.post.mockRejectedValue(new AxiosError("Network Error"));

    await expect(applicationService.create(payload)).rejects.toThrow(
      "Failed to create application",
    );
  });

  it("falls back to a generic message for unexpected errors", async () => {
    api.post.mockRejectedValue("boom");

    await expect(applicationService.create(payload)).rejects.toThrow(
      "Failed to create application",
    );
  });
});

describe("update", () => {
  it("puts the changes to the right URL and returns the updated application", async () => {
    const application = makeApplication({ id: 5, status: "Offer" });
    api.put.mockResolvedValue({ data: { application } });

    await expect(
      applicationService.update(5, { status: "Offer" }),
    ).resolves.toBe(application);
    expect(api.put).toHaveBeenCalledWith("/api/applications/5", {
      status: "Offer",
    });
  });

  it("surfaces the API's error message", async () => {
    api.put.mockRejectedValue(apiError(404, { error: "Application not found" }));

    await expect(applicationService.update(5, {})).rejects.toThrow(
      "Application not found",
    );
  });

  it("falls back to a generic message", async () => {
    api.put.mockRejectedValue(new AxiosError("Network Error"));

    await expect(applicationService.update(5, {})).rejects.toThrow(
      "Failed to update application",
    );
  });
});

describe("delete", () => {
  it("deletes by id", async () => {
    api.delete.mockResolvedValue({});

    await expect(applicationService.delete(9)).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith("/api/applications/9");
  });

  it("lets errors propagate so the UI can react", async () => {
    api.delete.mockRejectedValue(new Error("nope"));

    await expect(applicationService.delete(9)).rejects.toThrow("nope");
  });
});
