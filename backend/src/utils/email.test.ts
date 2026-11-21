import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ send: vi.fn(), Resend: vi.fn() }));

vi.mock("resend", () => ({ Resend: mocks.Resend }));

const loadSender = async () => {
  vi.resetModules();
  return (await import("./email.js")).sendVerificationCode;
};

beforeEach(() => {
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Job Trackr <login@example.com>");
  mocks.Resend.mockImplementation(function () {
    return { emails: { send: mocks.send } };
  });
  mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
});

describe("sendVerificationCode", () => {
  it("creates the Resend client with the configured API key", async () => {
    await loadSender();

    expect(mocks.Resend).toHaveBeenCalledWith("re_test_key");
  });

  it("sends the code to the recipient from the configured sender", async () => {
    const sendVerificationCode = await loadSender();

    await sendVerificationCode("user@example.com", "123456");

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const message = mocks.send.mock.calls[0][0];
    expect(message.from).toBe("Job Trackr <login@example.com>");
    expect(message.to).toBe("user@example.com");
    expect(message.subject).toMatch(/login code/i);
    expect(message.html).toContain("<strong>123456</strong>");
    expect(message.html).toContain("10 minutes");
  });

  it("resolves when Resend accepts the email", async () => {
    const sendVerificationCode = await loadSender();

    await expect(
      sendVerificationCode("user@example.com", "123456"),
    ).resolves.toBeUndefined();
  });

  it("propagates network-level failures", async () => {
    mocks.send.mockRejectedValue(new Error("fetch failed"));
    const sendVerificationCode = await loadSender();

    await expect(
      sendVerificationCode("user@example.com", "123456"),
    ).rejects.toThrow("fetch failed");
  });
});
