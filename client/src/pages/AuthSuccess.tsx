import { AUTH_SUCCESS_TOAST_KEY } from "@/lib/oauthLoginState";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function AuthSuccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    try {
      sessionStorage.setItem(AUTH_SUCCESS_TOAST_KEY, "shown");
    } catch {
      // Continue if browser storage is blocked.
    }
    const previewOnly = new URLSearchParams(window.location.search).get("preview") === "1";
    const timer = previewOnly ? undefined : window.setTimeout(() => setLocation("/servers"), 1400);
    return () => { if (timer !== undefined) window.clearTimeout(timer); };
  }, [setLocation]);

  return <main className="flex min-h-screen items-center justify-center bg-[#111713] px-6 text-[#eff4e8] soft-grid"><section className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#171f19] p-8 text-center shadow-2xl"><div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#c5ff3f] text-[#151a16]"><CheckCircle2 className="h-8 w-8" /></div><p className="mono mt-6 text-[10px] uppercase tracking-[0.18em] text-[#9daa98]">authentication complete</p><h1 className="display-title mt-3 text-3xl tracking-[-0.06em]">Вход выполнен</h1><p className="mt-3 text-sm leading-6 text-[#aab6a7]">Авторизация подтверждена. Подготавливаем панель управления серверами.</p><div className="mt-7 h-1.5 overflow-hidden rounded-full bg-[#293629]"><div className="h-full w-full origin-left animate-[progress_1.4s_linear] rounded-full bg-[#c5ff3f]" /></div><div className="mt-5 flex items-center justify-center gap-2 text-xs text-[#9daa98]"><Loader2 className="h-3.5 w-3.5 animate-spin" />Переход в панель…</div><button onClick={() => setLocation("/servers")} className="mt-6 inline-flex items-center text-xs font-medium text-[#c5ff3f] hover:underline">Открыть сейчас <ChevronRight className="ml-1 h-3.5 w-3.5" /></button></section></main>;
}
