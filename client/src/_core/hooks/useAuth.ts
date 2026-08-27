import { trpc } from "@/lib/trpc";
import { AUTH_SUCCESS_TOAST_KEY } from "@/lib/oauthLoginState";
import { toast } from "sonner";
import { useCallback, useEffect, useMemo, useState } from "react";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export type LoginStatus = "idle" | "starting" | "error" | "success";

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const utils = trpc.useUtils();
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");

  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  const finishAuth = useCallback(() => {
    setLoginStatus("success");
    try {
      sessionStorage.setItem(AUTH_SUCCESS_TOAST_KEY, "shown");
    } catch {
      // Continue if browser storage is blocked.
    }
    toast.success("Вход выполнен", { description: "Открываем панель управления серверами…" });
    window.setTimeout(() => window.location.assign("/servers?auth=success"), 850);
  }, []);

  const loginEmailMutation = trpc.auth.loginEmail.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      finishAuth();
    },
    onError: error => {
      setLoginStatus("error");
      toast.error(error.message || "Не удалось выполнить вход");
    },
  });

  const registerEmailMutation = trpc.auth.registerEmail.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      finishAuth();
    },
    onError: error => {
      setLoginStatus("error");
      toast.error(error.message || "Не удалось создать аккаунт");
    },
  });

  const beginLogin = useCallback(() => {
    setLoginStatus("starting");
    window.location.assign("/api/auth/discord/start");
  }, []);

  const retryLogin = beginLogin;

  const logoutMutation = trpc.auth.logout.useMutation({
    onSuccess: () => {
      utils.auth.me.setData(undefined, null);
    },
  });

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      try {
        sessionStorage.removeItem("craftpanel-auth-success-toast");
      } catch {
        // Ignore blocked browser storage.
      }
      utils.auth.me.setData(undefined, null);
      await utils.auth.me.invalidate();
    }
  }, [logoutMutation, utils]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    setLoginStatus("starting");
    await loginEmailMutation.mutateAsync({ email, password });
  }, [loginEmailMutation]);

  const registerWithEmail = useCallback(async (name: string, email: string, password: string) => {
    setLoginStatus("starting");
    await registerEmailMutation.mutateAsync({ name, email, password });
  }, [registerEmailMutation]);

  const state = useMemo(() => {
    try {
      localStorage.setItem("craftpanel-runtime-user-info", JSON.stringify(meQuery.data));
    } catch {
      // Ignore blocked browser storage.
    }
    return {
      user: meQuery.data ?? null,
      loading: meQuery.isLoading || logoutMutation.isPending,
      error: meQuery.error ?? logoutMutation.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
    };
  }, [meQuery.data, meQuery.error, meQuery.isLoading, logoutMutation.error, logoutMutation.isPending]);

  useEffect(() => {
    if (!redirectOnUnauthenticated || meQuery.isLoading || logoutMutation.isPending || state.user || typeof window === "undefined") return;
    if (redirectPath && window.location.pathname === redirectPath) return;
    window.location.assign(redirectPath || "/");
  }, [redirectOnUnauthenticated, redirectPath, logoutMutation.isPending, meQuery.isLoading, state.user]);

  return {
    ...state,
    refresh: () => meQuery.refetch(),
    logout,
    loginStatus,
    beginLogin,
    retryLogin,
    loginWithEmail,
    registerWithEmail,
    authActionPending: loginEmailMutation.isPending || registerEmailMutation.isPending || loginStatus === "starting",
  };
}
