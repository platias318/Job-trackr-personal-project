import { describe, expect, it } from "vitest";

import { buildCvBlobPath, isPdfBuffer, sanitizeFileName } from "./pdf.js";

describe("isPdfBuffer", () => {
  it("accepts a buffer that starts with the PDF header", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n...rest of file"))).toBe(true);
  });

  it("accepts a header-only buffer", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-"))).toBe(true);
  });

  it("rejects an empty buffer", () => {
    expect(isPdfBuffer(Buffer.alloc(0))).toBe(false);
  });

  it("rejects a buffer shorter than the header", () => {
    expect(isPdfBuffer(Buffer.from("%PDF"))).toBe(false);
  });

  it("rejects plain text pretending to be a PDF", () => {
    expect(isPdfBuffer(Buffer.from("this is not a pdf at all"))).toBe(false);
  });

  it("rejects other binary formats (PNG)", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(isPdfBuffer(png)).toBe(false);
  });

  it("rejects a header that is not at the very start", () => {
    expect(isPdfBuffer(Buffer.from(" %PDF-1.4"))).toBe(false);
    expect(isPdfBuffer(Buffer.from("MZ....%PDF-1.4"))).toBe(false);
  });

  it("is case-sensitive", () => {
    expect(isPdfBuffer(Buffer.from("%pdf-1.4"))).toBe(false);
  });
});

describe("sanitizeFileName", () => {
  it.each([
    ["a normal name", "resume.pdf", "resume.pdf"],
    ["an upper-case extension", "Resume.PDF", "Resume.pdf"],
    ["spaces", "My CV 2026.pdf", "My-CV-2026.pdf"],
    ["no extension", "notes", "notes.pdf"],
    ["dots inside the name", "report.v2.final.pdf", "report.v2.final.pdf"],
    ["unix path traversal", "../../etc/passwd", "passwd.pdf"],
    ["a windows path", "C:\\Users\\me\\cv.pdf", "cv.pdf"],
    ["a right-to-left override character", "evil name\u202E.pdf", "evil-name.pdf"],
    ["quotes and shell characters", 'a"b;c&d|e.pdf', "a-b-c-d-e.pdf"],
    ["leading and trailing dots/dashes", "--.hidden.--.pdf", "hidden.pdf"],
  ])("handles %s", (_label, input, expected) => {
    expect(sanitizeFileName(input)).toBe(expected);
  });

  it.each([
    ["an empty name", ""],
    ["only whitespace", "   "],
    ["only the extension", ".pdf"],
    ["a Greek name (no safe characters survive)", "βιογραφικό.pdf"],
    ["only symbols", "###.pdf"],
  ])("falls back to cv.pdf for %s", (_label, input) => {
    expect(sanitizeFileName(input)).toBe("cv.pdf");
  });

  it("caps the stem at 60 characters", () => {
    expect(sanitizeFileName("a".repeat(200) + ".pdf")).toBe(
      "a".repeat(60) + ".pdf",
    );
  });

  it("always yields something safe to use in a storage path", () => {
    const nasty = ["../../x", "a/b\\c", "\u0000null", "name with \n newline.pdf"];
    for (const input of nasty) {
      expect(sanitizeFileName(input)).toMatch(/^[A-Za-z0-9._-]+\.pdf$/);
    }
  });
});

describe("buildCvBlobPath", () => {
  const PATH_PATTERN =
    /^cvs\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/[A-Za-z0-9._-]+\.pdf$/;

  it("uses the cvs/<uuid>/<safe-name>.pdf layout", () => {
    expect(buildCvBlobPath("My Resume.pdf")).toMatch(PATH_PATTERN);
    expect(buildCvBlobPath("My Resume.pdf")).toMatch(/\/My-Resume\.pdf$/);
  });

  it("generates a different, unguessable path every time", () => {
    const paths = new Set(
      Array.from({ length: 50 }, () => buildCvBlobPath("cv.pdf")),
    );
    expect(paths.size).toBe(50);
  });

  it("never leaks directories from the original name", () => {
    const path = buildCvBlobPath("../../secret/../cv.pdf");
    expect(path).toMatch(PATH_PATTERN);
    expect(path).not.toContain("..");
    expect(path).not.toContain("secret");
  });
});
