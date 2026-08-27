import { createOAuthLoginUrl, OAUTH_LOGIN_TIMEOUT_MS, startLogin } from "@/const";
import { trpc } from "@/lib/trpc";
import { TRPCClientError } from "@trpc/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type LoginStatus = "idle" | "starting" | "waiting" | "timed_out" | "error";

export function useAuth(options?: UseAuthOptions) {
  // Login is started via startLogin() in the effect below, only when we actually
  // navigate — never during render. startLogin() mints a one-time nonce + writes
  // the state cookie, so calling it per render would overwrite the cookie and
  // desync it from an in-flight login's `state`.
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const loginTimerRef = useRef<number | null>(null);
  const loginPollRef = useRef<number | null>(null);
  const popupRef = useRef<Window | null>(null);

  const clearLoginWatch = useCallback(() => {
    if (loginTimerRef.current !== null) window.clearTimeout(loginTimerRef.current);
    if (loginPollRef.current !== null) window.clearInterval(loginPollRef.current);
    loginTimerRef.current = null;
    loginPollRef.current = null;
    if (popupRef.current && !popupRef.current.closed) popupRef.current.close();
    popupRef.current = null;
  }, []);

  const beginLogin = useCallback(() => {
    clearLoginWatch();
    const loginUrl = createOAuthLoginUrl();
    if (!loginUrl) {
      setLoginStatus("error");
      return;
    }
    setLoginStatus("starting");
    const popup = window.open(loginUrl, "craftpanel-oauth", "popup,width=520,height=720,resizable=yes,scrollbars=yes");
    if (!popup) {
      // Popup blockers may return null; use a full-page redirect as a safe fallback.
      startLogin();
      return;
    }
    popupRef.current = popup;
    setLoginStatus("waiting");
    loginPollRef.current = window.setInterval(async () => {
      if (popup.closed) {
        clearLoginWatch();
        setLoginStatus("idle");
        return;
      }
      try {
        const result = await meQuery.refetch();
        if (result.data) {
          clearLoginWatch();
          setLoginStatus("idle");
        }
      } catch {
        // The auth query can briefly fail while the OAuth callback is completing.
      }
    }, 1000);
    loginTimerRef.current = window.setTimeout(() => {
      clearLoginWatch();
      setLoginStatus("timed_out");
    }, OAUTH_LOGIN_TIMEOUT_MS);
  }, [clearLoginWatch]);

  useEffect(() => () => clearLoginWatch(), [clearLoginWatch]);

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } catch (error: unknown) {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      ) {
        return;
      }
      throw error;
    } finally {
      // Clear the Preview auto-login token mirrored into sessionStorage, so
      // header-based sessions (Safari ITP / WebView) are logged out too. The
      // backend cookie is cleared by the logout mutation.
      try {
        sessionStorage.removeItem("manus-cookie");
      } catch {}
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const state = useMemo(() => {
    localStorage.setItem(
      "manus-runtime-user-info",
      JSON.stringify(meQuery.data)
    );
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [
    meQuery.data,
    meQuery.error,
    meQuery.isLoading,
    logoutMutation.error,
    logoutMutation.isPending,
  ]);

  useEffect(() => {
    if (!redirectOnUnauthenticated) return;
    if (meQuery.isLoading || logoutMutation.isPending) return;
    if (state.user) return;
    if (typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;

    // Navigate at this moment only. startLogin() mints the nonce + cookie itself.
    if (redirectPath) {
      window.location.href = redirectPath;
    } else {
      startLogin();
    }
  }, [
    redirectOnUnauthenticated,
    redirectPath,
    logoutMutation.isPending,
    meQuery.isLoading,
    state.user,
  ]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    loginStatus,
    beginLogin,
    retryLogin: beginLogin,
  };
}
