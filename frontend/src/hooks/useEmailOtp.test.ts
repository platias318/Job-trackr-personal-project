import { act } from "@testing-library/react";
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderHookWithProviders } from "@/test/renderWithProviders";

const mocks = vi.hoisted(() => ({
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
  getCurrentUser: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/services/auth.service", () => ({
  authService: {
    sendCode: mocks.sendCode,
    verifyCode: mocks.verifyCode,
    getCurrentUser: mocks.getCurrentUser,
  },
}));
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import { useEmailOtp } from "./useEmailOtp";

const user = { id: 1, email: "a@b.com", name: "A" };

const httpError = (status: number) =>
  new AxiosError("fail", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: {},
  });

const setup = () => renderHookWithProviders(() => useEmailOtp());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendCode.mockResolvedValue(undefined);
  mocks.verifyCode.mockResolvedValue(undefined);
  mocks.getCurrentUser.mockResolvedValue(user);
});

describe("initial state", () => {
  it("starts on the email step with nothing entered", () => {
    const { result } = setup();

    expect(result.current).toMatchObject({
      emailStep: "input",
      email: "",
      code: "",
      isLoading: false,
      error: null,
    });
  });
});

describe("handleSendCode", () => {
  it("does nothing while the email is empty", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(mocks.sendCode).not.toHaveBeenCalled();
    expect(result.current.emailStep).toBe("input");
  });

  it("sends the code and moves to the code step", async () => {
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(mocks.sendCode).toHaveBeenCalledWith("a@b.com");
    expect(result.current.emailStep).toBe("code");
    expect(result.current.error).toBeNull();
    expect(result.current.isLoading).toBe(false);
  });

  it("is in the loading state while the request is in flight", async () => {
    let finish!: () => void;
    mocks.sendCode.mockReturnValue(new Promise<void>((resolve) => (finish = resolve)));
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.handleSendCode();
    });
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isLoading).toBe(false);
  });

  it.each([
    [429, "HomePage.errors.tooManyRequests"],
    [400, "HomePage.errors.invalidEmail"],
    [500, "HomePage.errors.sendCodeFailed"],
  ])("shows the right message for HTTP %i and stays on the email step", async (status, key) => {
    mocks.sendCode.mockRejectedValue(httpError(status));
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(result.current.error).toBe(key);
    expect(result.current.emailStep).toBe("input");
    expect(result.current.isLoading).toBe(false);
  });

  it("shows the generic message for non-HTTP failures", async () => {
    mocks.sendCode.mockRejectedValue(new Error("offline"));
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(result.current.error).toBe("HomePage.errors.sendCodeFailed");
  });

  it("clears the previous error on a new attempt", async () => {
    mocks.sendCode.mockRejectedValueOnce(httpError(429));
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));
    await act(async () => {
      await result.current.handleSendCode();
    });
    expect(result.current.error).not.toBeNull();

    await act(async () => {
      await result.current.handleSendCode();
    });

    expect(result.current.error).toBeNull();
  });
});

describe("handleVerifyCode", () => {
  it("does nothing while the code is empty", async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    expect(mocks.verifyCode).not.toHaveBeenCalled();
  });

  it("verifies, loads the user into the store and goes to the dashboard", async () => {
    const { result, store } = setup();
    act(() => {
      result.current.setEmail("a@b.com");
      result.current.setCode("123456");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    expect(mocks.verifyCode).toHaveBeenCalledWith("a@b.com", "123456");
    expect(store.getState().common).toMatchObject({
      user,
      isUserAuthenticated: true,
    });
    expect(mocks.navigate).toHaveBeenCalledWith("/dashboard");
  });

  it("shows an error and does not navigate when the code is wrong", async () => {
    mocks.verifyCode.mockRejectedValue(httpError(401));
    const { result, store } = setup();
    act(() => {
      result.current.setEmail("a@b.com");
      result.current.setCode("000000");
    });

    await act(async () => {
      await result.current.handleVerifyCode();
    });

    expect(result.current.error).toBe("HomePage.errors.invalidOrExpiredCode");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(store.getState().common.isUserAuthenticated).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });
});

describe("reset", () => {
  it("goes back to the email step and clears the code and error", async () => {
    mocks.sendCode.mockResolvedValue(undefined);
    const { result } = setup();
    act(() => result.current.setEmail("a@b.com"));
    await act(async () => {
      await result.current.handleSendCode();
    });
    act(() => result.current.setCode("123"));

    act(() => result.current.reset());

    expect(result.current).toMatchObject({
      emailStep: "input",
      code: "",
      error: null,
    });
    expect(result.current.email).toBe("a@b.com"); // keeps the email for convenience
  });
});
