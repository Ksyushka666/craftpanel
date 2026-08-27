export type LoginStatus = "idle" | "starting" | "waiting" | "timed_out" | "error";

export const isLoginPending = (status: LoginStatus) => status === "starting" || status === "waiting";
export const isLoginRetryable = (status: LoginStatus) => status === "timed_out" || status === "error";

export const getLoginButtonLabel = (status: LoginStatus) =>
  isLoginRetryable(status)
    ? "Повторить вход"
    : isLoginPending(status)
      ? "Ожидаем подтверждение…"
      : "Войти в CraftPanel";
