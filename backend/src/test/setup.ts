import { beforeEach, vi } from "vitest";

// Route handlers log unexpected errors with console.error. The failure-path
// tests trigger those on purpose, so keep the test output readable.
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
