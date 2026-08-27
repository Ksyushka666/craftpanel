import { describe, expect, it } from "vitest";
import { getLoginButtonLabel, isLoginPending, isLoginRetryable } from "./oauthLoginState";

describe("local authentication UI states", () => {
  it("disables the auth actions while credentials are being checked", () => {
    expect(isLoginPending("starting")).toBe(true);
    expect(isLoginPending("idle")).toBe(false);
    expect(isLoginPending("success")).toBe(false);
  });

  it("offers retry after a failed auth request", () => {
    expect(isLoginRetryable("error")).toBe(true);
    expect(isLoginRetryable("idle")).toBe(false);
    expect(getLoginButtonLabel("error")).toBe("Повторить вход");
  });

  it("shows explicit labels for idle, pending, and success states", () => {
    expect(getLoginButtonLabel("idle")).toBe("Войти");
    expect(getLoginButtonLabel("starting")).toBe("Проверяем данные…");
    expect(getLoginButtonLabel("success")).toBe("Вход выполнен");
  });
});
