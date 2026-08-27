import { describe, expect, it } from "vitest";
import { getLoginButtonLabel, isLoginPending, isLoginRetryable } from "./oauthLoginState";

describe("OAuth login UI states", () => {
  it("disables login while waiting for the popup", () => {
    expect(isLoginPending("starting")).toBe(true);
    expect(isLoginPending("waiting")).toBe(true);
    expect(isLoginPending("idle")).toBe(false);
  });

  it("offers retry after timeout or launch error", () => {
    expect(isLoginRetryable("timed_out")).toBe(true);
    expect(isLoginRetryable("error")).toBe(true);
    expect(getLoginButtonLabel("timed_out")).toBe("Повторить вход");
    expect(getLoginButtonLabel("error")).toBe("Повторить вход");
  });

  it("keeps the normal label for idle and waiting states", () => {
    expect(getLoginButtonLabel("idle")).toBe("Войти в CraftPanel");
    expect(getLoginButtonLabel("waiting")).toBe("Ожидаем подтверждение…");
  });
});
