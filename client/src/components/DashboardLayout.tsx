import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/useMobile";
import { AUTH_SUCCESS_TOAST_KEY } from "@/lib/oauthLoginState";
import { Boxes, ChartNoAxesCombined, CircleHelp, Files, KeyRound, LayoutDashboard, Loader2, LogOut, MessageCircle, PanelLeft, Settings2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const menuItems = [
  { icon: LayoutDashboard, label: "Обзор", path: "/" },
  { icon: ChartNoAxesCombined, label: "Серверы", path: "/servers" },
  { icon: Boxes, label: "Каталог", path: "/library" },
  { icon: Files, label: "Бэкапы", path: "/backups" },
];

const systemMenuItems = [
  { icon: Settings2, label: "Настройки", path: "/settings" },
  { icon: KeyRound, label: "OAuth диагностика", path: "/diagnostics/oauth" },
  { icon: CircleHelp, label: "Помощь", path: "/help" },
];

const SIDEBAR_WIDTH_KEY = "craftpanel-sidebar-width";
const DEFAULT_WIDTH = 252;
const MIN_WIDTH = 220;
const MAX_WIDTH = 360;

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { loading, user, loginStatus, beginLogin, loginWithEmail, registerWithEmail, authActionPending } = useAuth();

  useEffect(() => { localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString()); }, [sidebarWidth]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authResult = params.get("auth");
    if (authResult === "error") {
      const reason = params.get("reason");
      const description = reason === "discord_state" ? "Сессия Discord истекла. Запустите вход ещё раз." : "Discord не подтвердил авторизацию. Проверьте настройки приложения.";
      toast.error("Не удалось выполнить вход", { description });
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    if (authResult !== "success") return;
    let shouldShow = true;
    try {
      shouldShow = sessionStorage.getItem(AUTH_SUCCESS_TOAST_KEY) !== "shown";
      sessionStorage.setItem(AUTH_SUCCESS_TOAST_KEY, "shown");
    } catch {
      // Continue without deduplication when browser storage is blocked.
    }
    if (shouldShow) toast.success("Вход выполнен", { description: "Панель управления серверами готова." });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, []);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) {
    const submitting = authActionPending || loginStatus === "starting";
    return (
      <div className="min-h-screen bg-[#111713] text-[#eff4e8] flex items-center justify-center px-6 py-8 soft-grid">
        <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-[#171f19] p-7 shadow-2xl sm:p-8">
          <div className="mb-8 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#c5ff3f] text-[#151a16] font-bold">C</div><span className="text-lg font-semibold tracking-[-0.04em]">craftpanel<span className="text-[#c5ff3f]">.</span></span></div>
          <p className="mono mb-3 text-[11px] uppercase tracking-[0.18em] text-[#9daa98]">private game infrastructure</p>
          <h1 className="display-title mb-4 max-w-xs">Твои миры.<br /><span className="text-[#c5ff3f]">Под твоим контролем.</span></h1>
          <p className="mb-6 text-sm leading-6 text-[#aab6a7]">Войди, чтобы управлять серверами, конфигурациями и резервными копиями из одного рабочего пространства.</p>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-[#202a21] p-1"><button onClick={() => setAuthMode("login")} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${authMode === "login" ? "bg-[#c5ff3f] text-[#151a16]" : "text-[#9daa98] hover:text-white"}`}>Войти</button><button onClick={() => setAuthMode("register")} className={`rounded-lg px-3 py-2 text-xs font-medium transition-colors ${authMode === "register" ? "bg-[#c5ff3f] text-[#151a16]" : "text-[#9daa98] hover:text-white"}`}>Регистрация</button></div>
          <form onSubmit={event => { event.preventDefault(); void (authMode === "login" ? loginWithEmail(email, password) : registerWithEmail(name, email, password)); }} className="space-y-3">
            {authMode === "register" && <Input value={name} onChange={event => setName(event.target.value)} placeholder="Имя" aria-label="Имя" autoComplete="name" required className="h-11 rounded-xl border-white/10 bg-[#202a21] text-sm text-white placeholder:text-[#71806f]" />}
            <Input value={email} onChange={event => setEmail(event.target.value)} placeholder="Email" aria-label="Email" type="email" autoComplete="email" required className="h-11 rounded-xl border-white/10 bg-[#202a21] text-sm text-white placeholder:text-[#71806f]" />
            <Input value={password} onChange={event => setPassword(event.target.value)} placeholder="Пароль (минимум 8 символов)" aria-label="Пароль" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} required className="h-11 rounded-xl border-white/10 bg-[#202a21] text-sm text-white placeholder:text-[#71806f]" />
            <Button type="submit" disabled={submitting} className="h-11 w-full rounded-xl bg-[#c5ff3f] font-semibold text-[#151a16] hover:bg-[#d7ff76] disabled:cursor-wait disabled:opacity-80">{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{authMode === "login" ? "Войти по email" : "Создать аккаунт"}</Button>
          </form>
          <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.16em] text-[#71806f]"><span className="h-px flex-1 bg-white/10" />или<span className="h-px flex-1 bg-white/10" /></div>
          <Button type="button" variant="outline" onClick={beginLogin} disabled={submitting} className="h-11 w-full rounded-xl border-white/10 bg-[#202a21] text-sm text-[#eff4e8] hover:bg-[#293629]"><MessageCircle className="mr-2 h-4 w-4 text-[#7289da]" />Войти через Discord</Button>
          {loginStatus === "starting" && <p role="status" className="mt-3 text-center text-xs leading-5 text-[#aab6a7]">Открываем защищённый вход…</p>}
          {loginStatus === "error" && <p role="alert" className="mt-3 text-center text-xs leading-5 text-[#ffb4be]">Не удалось выполнить вход. Проверьте данные и попробуйте ещё раз.</p>}
          <div className="mt-6 flex items-center gap-2 text-xs text-[#839180]"><ShieldCheck className="h-4 w-4 text-[#c5ff3f]" /> Пароли защищены односторонним хешированием</div>
          <button type="button" onClick={() => window.location.assign("/diagnostics/oauth")} className="mt-4 flex w-full items-center justify-center gap-2 text-xs text-[#9daa98] transition-colors hover:text-[#c5ff3f]"><KeyRound className="h-3.5 w-3.5" />Открыть диагностику авторизации</button>
        </div>
      </div>
    );
  }

  return <SidebarProvider style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}><DashboardLayoutContent setSidebarWidth={setSidebarWidth}>{children}</DashboardLayoutContent></SidebarProvider>;
}

function DashboardLayoutContent({ children, setSidebarWidth }: { children: React.ReactNode; setSidebarWidth: (width: number) => void }) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const isMobile = useIsMobile();
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = [...menuItems, ...systemMenuItems].find(item => item.path === location) ?? menuItems[0];

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar collapsible="icon" className="border-r-0" disableTransition={isResizing}>
          <SidebarHeader className="h-[84px] justify-center px-4">
            <div className="flex items-center gap-3">
              <button onClick={toggleSidebar} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#c5ff3f] text-[#151a16] transition-transform active:scale-95" aria-label="Свернуть навигацию"><PanelLeft className="h-4 w-4" /></button>
              {!isCollapsed && <div><div className="text-[17px] font-semibold tracking-[-0.05em]">craftpanel<span className="text-[#c5ff3f]">.</span></div><div className="mono mt-0.5 text-[9px] uppercase tracking-[0.15em] text-[#7e8e7d]">control center</div></div>}
            </div>
          </SidebarHeader>
          <SidebarContent className="px-3 pt-5">
            {!isCollapsed && <div className="mono mb-3 px-3 text-[9px] uppercase tracking-[0.18em] text-[#71806f]">Workspace</div>}
            <SidebarMenu className="gap-1">
              {menuItems.map(item => {
                const active = location === item.path;
                return <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={active} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl px-3 text-[13px] font-medium text-[#aab8a4] transition-colors data-[active=true]:bg-[#c5ff3f] data-[active=true]:text-[#151a16] hover:bg-[#1d281e] hover:text-[#eff4e8]"><item.icon className="h-[17px] w-[17px]" /><span>{item.label}</span>{item.path === "/servers" && !isCollapsed && <span className="mono ml-auto text-[10px] opacity-60">03</span>}</SidebarMenuButton></SidebarMenuItem>;
              })}
            </SidebarMenu>
            {!isCollapsed && <div className="mt-10 mono mb-3 px-3 text-[9px] uppercase tracking-[0.18em] text-[#71806f]">System</div>}
            <SidebarMenu className="gap-1">
              {systemMenuItems.map(item => <SidebarMenuItem key={item.path}><SidebarMenuButton isActive={location === item.path} onClick={() => setLocation(item.path)} tooltip={item.label} className="h-11 rounded-xl px-3 text-[13px] font-medium text-[#aab8a4] transition-colors data-[active=true]:bg-[#c5ff3f] data-[active=true]:text-[#151a16] hover:bg-[#1d281e] hover:text-[#eff4e8]"><item.icon className="h-[17px] w-[17px]" /><span>{item.label}</span></SidebarMenuButton></SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="p-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-[#1d281e] group-data-[collapsible=icon]:justify-center"><Avatar className="h-8 w-8 border border-white/10 bg-[#2a3529]"><AvatarFallback className="bg-[#2a3529] text-xs font-semibold text-[#c5ff3f]">{user?.name?.charAt(0).toUpperCase() ?? "U"}</AvatarFallback></Avatar><div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden"><p className="truncate text-[12px] font-medium text-[#eef6e9]">{user?.name || "Ваш аккаунт"}</p><p className="mono mt-1 truncate text-[9px] text-[#71806f]">{user?.email || "authenticated"}</p></div></button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onClick={logout} className="cursor-pointer text-destructive focus:text-destructive"><LogOut className="mr-2 h-4 w-4" /> Выйти</DropdownMenuItem></DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-[#c5ff3f]/30 ${isCollapsed ? "hidden" : ""}`} onMouseDown={() => setIsResizing(true)} />
      </div>
      <SidebarInset className="bg-[#f4f1e8] dark:bg-[#111713]">
        {isMobile && <div className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[#dfe2d6] bg-[#f4f1e8]/90 px-4 backdrop-blur dark:border-white/10 dark:bg-[#111713]/90"><SidebarTrigger className="h-9 w-9 rounded-lg" /><span className="text-sm font-semibold">{activeMenuItem.label}</span></div>}
        <main className="min-h-screen">{children}</main>
      </SidebarInset>
    </>
  );
}
