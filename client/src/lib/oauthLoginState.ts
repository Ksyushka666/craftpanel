export type LoginStatus = "idle" | "starting" | "error" | "success";

export const AUTH_SUCCESS_TOAST_KEY = "craftpanel-auth-success-toast";
export const isLoginPending = (status: LoginStatus) => status === "starting";
export const isLoginRetryable = (status: LoginStatus) => status === "error";

export const getLoginButtonLabel = (status: LoginStatus) =>
  status === "success"
    ? "Вход выполнен"
    : isLoginRetryable(status)
      ? "Повторить вход"
      : isLoginPending(status)
        ? "Проверяем данные…"
        : "Войти";
