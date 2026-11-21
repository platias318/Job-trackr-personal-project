import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeCV } from "@/test/factories";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/services/api", () => ({ default: api }));

import { cvService } from "./cv.service";

const apiError = (status: number, data?: unknown) =>
  new AxiosError("Request failed with status code " + status, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data,
  });

const pdf = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });

const sentForm = (): FormData => api.post.mock.calls[0][1];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAll", () => {
  it("returns the cvs array", async () => {
    const cvs = [makeCV(), makeCV()];
    api.get.mockResolvedValue({ data: { cvs } });

    await expect(cvService.getAll()).resolves.toBe(cvs);
    expect(api.get).toHaveBeenCalledWith("/api/cvs");
  });
});

describe("create", () => {
  it("uploads the file and fields as multipart form data and returns the CV", async () => {
    const cv = makeCV();
    api.post.mockResolvedValue({ data: { cv } });

    const result = await cvService.create({
      file: pdf,
      name: "Frontend CV",
      version_label: "v2",
      notes: "tailored",
      is_default: true,
    });

    expect(result).toBe(cv);
    const [url, , config] = api.post.mock.calls[0];
    expect(url).toBe("/api/cvs");
    expect(config.headers["Content-Type"]).toBe("multipart/form-data");

    const form = sentForm();
    expect(form.get("file")).toBeInstanceOf(File);
    expect((form.get("file") as File).name).toBe("cv.pdf");
    expect(form.get("name")).toBe("Frontend CV");
    expect(form.get("version_label")).toBe("v2");
    expect(form.get("notes")).toBe("tailored");
    expect(form.get("is_default")).toBe("true");
  });

  it("sends is_default as the string 'false' when not set (the API expects a string)", async () => {
    api.post.mockResolvedValue({ data: { cv: makeCV() } });

    await cvService.create({ file: pdf, name: "CV" });

    expect(sentForm().get("is_default")).toBe("false");
  });

  it("leaves out optional fields that were not provided", async () => {
    api.post.mockResolvedValue({ data: { cv: makeCV() } });

    await cvService.create({ file: pdf, name: "CV", version_label: "", notes: "" });

    expect(sentForm().has("version_label")).toBe(false);
    expect(sentForm().has("notes")).toBe(false);
  });

  it("shows the message the API sent (for example the size limit)", async () => {
    api.post.mockRejectedValue(
      apiError(400, { error: "The PDF must be smaller than 1 MB" }),
    );

    await expect(cvService.create({ file: pdf, name: "CV" })).rejects.toThrow(
      "The PDF must be smaller than 1 MB",
    );
  });

  it("does NOT show Axios' generic 'Request failed with status code 400' text", async () => {
    api.post.mockRejectedValue(apiError(400, {}));

    await expect(cvService.create({ file: pdf, name: "CV" })).rejects.toThrow(
      "Failed to upload CV",
    );
  });

  it("falls back to a generic message on a network error", async () => {
    api.post.mockRejectedValue(new AxiosError("Network Error"));

    await expect(cvService.create({ file: pdf, name: "CV" })).rejects.toThrow(
      "Failed to upload CV",
    );
  });

  it("keeps the message of a plain Error and falls back for anything else", async () => {
    api.post.mockRejectedValueOnce(new Error("custom"));
    await expect(cvService.create({ file: pdf, name: "CV" })).rejects.toThrow("custom");

    api.post.mockRejectedValueOnce("boom");
    await expect(cvService.create({ file: pdf, name: "CV" })).rejects.toThrow(
      "Failed to upload CV",
    );
  });
});

describe("update", () => {
  it("puts the changes to the right URL and returns the updated CV", async () => {
    const cv = makeCV({ id: 4, name: "Renamed" });
    api.put.mockResolvedValue({ data: { cv } });

    await expect(cvService.update(4, { name: "Renamed" })).resolves.toBe(cv);
    expect(api.put).toHaveBeenCalledWith("/api/cvs/4", { name: "Renamed" });
  });

  it("surfaces the API's error message", async () => {
    api.put.mockRejectedValue(apiError(404, { error: "CV not found" }));

    await expect(cvService.update(4, {})).rejects.toThrow("CV not found");
  });

  it("falls back to a generic message", async () => {
    api.put.mockRejectedValue(new AxiosError("Network Error"));

    await expect(cvService.update(4, {})).rejects.toThrow("Failed to update CV");
  });
});

describe("delete", () => {
  it("deletes by id", async () => {
    api.delete.mockResolvedValue({});

    await expect(cvService.delete(4)).resolves.toBeUndefined();
    expect(api.delete).toHaveBeenCalledWith("/api/cvs/4");
  });
});
