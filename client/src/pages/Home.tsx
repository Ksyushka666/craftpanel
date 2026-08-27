import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { useTheme } from "@/contexts/ThemeContext";
import { getThemeToggleLabel } from "@/lib/theme";
import {
  appendMetricPoint,
  createMetricPoint,
  type MetricPoint,
} from "@/lib/metrics";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowUpRight,
  Blocks,
  Box,
  Check,
  ChevronRight,
  CircleDot,
  CloudDownload,
  Copy,
  Cpu,
  Database,
  Download,
  FileArchive,
  FileCog,
  FileStack,
  FolderOpen,
  Gamepad2,
  HardDrive,
  LayoutGrid,
  LifeBuoy,
  Loader2,
  LockKeyhole,
  MemoryStick,
  Moon,
  MoreHorizontal,
  PackageOpen,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings2,
  ShieldCheck,
  Square,
  Sun,
  Terminal,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";

const catalog = [
  {
    type: "Сборка",
    catalogType: "modpack" as const,
    title: "Better Minecraft",
    version: "1.21.1",
    meta: "1.21.1 · 187 модов",
    image: "BM",
    color: "from-[#6877ff] to-[#bda4ff]",
    installs: "24.8k",
  },
  {
    type: "Плагин",
    catalogType: "plugin" as const,
    title: "EssentialsX",
    version: "2.20.1",
    meta: "1.21 · 2.4M установок",
    image: "EX",
    color: "from-[#c5ff3f] to-[#8bb9ff]",
    installs: "2.4m",
  },
  {
    type: "Карта",
    catalogType: "map" as const,
    title: "Skyblock Islands",
    version: "1.20+",
    meta: "1.20+ · 84 MB",
    image: "SI",
    color: "from-[#ffbd75] to-[#e88074]",
    installs: "48.1k",
  },
];

const formatTime = (date: Date | string | number | null | undefined) =>
  date
    ? new Date(date).toLocaleString("ru-RU", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "только что";
const percent = (value: number, total: number) =>
  total ? Math.min(100, Math.round((value / total) * 100)) : 0;

type Server = {
  id: number;
  name: string;
  serverType: "java" | "bedrock";
  core: string;
  version: string;
  status: "online" | "offline" | "starting" | "stopping";
  maxPlayers: number;
  playersOnline: number;
  tps: number;
  ramUsedMb: number;
  ramTotalMb: number;
  cpuPercent: number;
  diskUsedGb: number;
  diskTotalGb: number;
  address: string | null;
  motd: string | null;
  pvp: number;
  onlineMode: number;
  createdAt: Date;
  updatedAt: Date;
};

export default function Home() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [location, setLocation] = useLocation();
  const [activeServerId, setActiveServerId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [commandOutput, setCommandOutput] = useState(
    "Подключение к консоли установлено."
  );
  const [logFilter, setLogFilter] = useState<
    "all" | "system" | "info" | "warn" | "error" | "debug"
  >("all");
  const [metricHistory, setMetricHistory] = useState<MetricPoint[]>([]);
  const [historyServerId, setHistoryServerId] = useState<number | null>(null);
  const [configDraft, setConfigDraft] = useState({
    serverType: "java" as "java" | "bedrock",
    core: "Paper",
    version: "1.21.1",
    maxPlayers: 20,
    motd: "",
    pvp: true,
    onlineMode: true,
  });
  const [newServer, setNewServer] = useState({
    name: "",
    serverType: "java" as "java" | "bedrock",
    core: "Paper",
    version: "1.21.1",
    maxPlayers: 20,
  });

  const serversQuery = trpc.servers.list.useQuery(undefined, {
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const servers = (serversQuery.data ?? []) as Server[];
  const activeServer =
    servers.find(server => server.id === activeServerId) ?? servers[0];
  const utils = trpc.useUtils();
  const actionMutation = trpc.servers.action.useMutation({
    onSuccess: async (result, input) => {
      setCommandOutput(result.output);
      await Promise.all([
        utils.servers.list.invalidate(),
        activeServer
          ? utils.servers.actions.invalidate({ id: activeServer.id })
          : Promise.resolve(),
      ]);
      toast.success(
        input.action === "command"
          ? "Команда отправлена"
          : `Сервер ${input.action === "start" ? "запущен" : input.action === "stop" ? "остановлен" : "перезапущен"}`
      );
    },
    onError: error =>
      toast.error(error.message || "Не удалось выполнить действие"),
  });
  const createMutation = trpc.servers.create.useMutation({
    onSuccess: async () => {
      setCreateOpen(false);
      setNewServer({
        name: "",
        serverType: "java",
        core: "Paper",
        version: "1.21.1",
        maxPlayers: 20,
      });
      await utils.servers.list.invalidate();
      toast.success("Сервер добавлен в рабочее пространство");
    },
    onError: error => toast.error(error.message || "Не удалось создать сервер"),
  });
  const configMutation = trpc.servers.updateConfig.useMutation({
    onSuccess: async () => {
      if (activeServer)
        await Promise.all([
          utils.servers.list.invalidate(),
          utils.servers.actions.invalidate({ id: activeServer.id }),
        ]);
      toast.success("Конфигурация сохранена");
    },
    onError: error =>
      toast.error(error.message || "Не удалось сохранить конфигурацию"),
  });
  const actionsQuery = trpc.servers.actions.useQuery(
    { id: activeServer?.id ?? 0 },
    { enabled: Boolean(activeServer) }
  );
  const logsQuery = trpc.servers.logs.useQuery(
    { id: activeServer?.id ?? 0 },
    {
      enabled: Boolean(activeServer),
      refetchInterval: 1200,
      refetchIntervalInBackground: false,
    }
  );
  const backupsQuery = trpc.servers.backups.useQuery(
    { id: activeServer?.id ?? 0 },
    { enabled: Boolean(activeServer) }
  );
  const installationsQuery = trpc.servers.catalog.installed.useQuery(
    { id: activeServer?.id ?? 0 },
    { enabled: Boolean(activeServer) }
  );
  const installMutation = trpc.servers.catalog.install.useMutation({
    onSuccess: async () => {
      if (activeServer)
        await Promise.all([
          utils.servers.catalog.installed.invalidate({ id: activeServer.id }),
          utils.servers.actions.invalidate({ id: activeServer.id }),
        ]);
      toast.success("Установка добавлена в server workspace");
    },
    onError: error =>
      toast.error(error.message || "Не удалось установить расширение"),
  });
  const fileCreateMutation = trpc.servers.files.create.useMutation({
    onSuccess: async () => {
      if (activeServer) await utils.servers.files.list.invalidate();
      toast.success("Элемент добавлен в файловый менеджер");
    },
    onError: error =>
      toast.error(error.message || "Не удалось создать элемент"),
  });
  const backupMutation = trpc.servers.backupAction.useMutation({
    onSuccess: async result => {
      if (activeServer)
        await utils.servers.backups.invalidate({ id: activeServer.id });
      if (result.downloadUrl)
        window.open(result.downloadUrl, "_blank", "noopener,noreferrer");
      toast.success(result.output);
    },
    onError: async error => {
      if (activeServer)
        await utils.servers.backups.invalidate({ id: activeServer.id });
      toast.error(error.message || "Не удалось выполнить действие с бэкапом");
    },
  });
  const createBackupMutation = trpc.servers.createBackup.useMutation({
    onSuccess: async () => {
      if (activeServer)
        await utils.servers.backups.invalidate({ id: activeServer.id });
      toast.success("Резервная копия создана");
    },
    onError: error => toast.error(error.message || "Не удалось создать бэкап"),
  });

  useEffect(() => {
    if (!activeServer) return;
    setConfigDraft({
      serverType: activeServer.serverType,
      core: activeServer.core,
      version: activeServer.version,
      maxPlayers: activeServer.maxPlayers,
      motd: activeServer.motd ?? "",
      pvp: Boolean(activeServer.pvp),
      onlineMode: Boolean(activeServer.onlineMode),
    });
  }, [activeServer?.id, activeServer?.updatedAt]);

  const pageTitle =
    location === "/library"
      ? "Каталог расширений"
      : location === "/backups"
        ? "Резервные копии"
        : location === "/settings"
          ? "Настройки пространства"
          : location === "/help"
            ? "Центр помощи"
            : "Доброе утро";
  const onlineCount = servers.filter(
    server => server.status === "online"
  ).length;
  const totalPlayers = servers.reduce(
    (total, server) => total + server.playersOnline,
    0
  );
  const visibleLogs = useMemo(() => {
    const logs = (logsQuery.data ?? []).slice().reverse();
    return logFilter === "all"
      ? logs
      : logs.filter(log => log.level === logFilter);
  }, [logsQuery.data, logFilter]);
  const chartData = useMemo(
    () =>
      metricHistory.map(point => ({
        ...point,
        time: new Date(point.timestamp).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      })),
    [metricHistory]
  );

  useEffect(() => {
    if (!activeServer) {
      setMetricHistory([]);
      setHistoryServerId(null);
      return;
    }
    const point = createMetricPoint(activeServer);
    setMetricHistory(previous => {
      const base = historyServerId === activeServer.id ? previous : [];
      return appendMetricPoint(base, point);
    });
    setHistoryServerId(activeServer.id);
  }, [
    activeServer?.id,
    activeServer?.cpuPercent,
    activeServer?.ramUsedMb,
    activeServer?.ramTotalMb,
    activeServer?.playersOnline,
    historyServerId,
  ]);

  const runServerAction = (action: "start" | "stop" | "restart") => {
    if (!activeServer) return;
    actionMutation.mutate({ id: activeServer.id, action });
  };
  const sendCommand = (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeServer || !command.trim()) return;
    actionMutation.mutate({
      id: activeServer.id,
      action: "command",
      command: command.trim(),
    });
    setCommand("");
  };
  const saveConfig = () => {
    if (!activeServer) return;
    configMutation.mutate({ id: activeServer.id, ...configDraft });
  };
  const copyAddress = async () => {
    if (!activeServer?.address) return;
    await navigator.clipboard?.writeText(activeServer.address);
    toast.success("Адрес скопирован");
  };

  return (
    <div className="min-h-screen bg-[#f4f1e8] text-[#151a16] soft-grid dark:bg-[#111713] dark:text-[#edf4e8]">
      <header className="border-b border-[#dfe2d6]/80 bg-[#f4f1e8]/88 px-4 py-4 backdrop-blur sm:px-6 lg:px-10 dark:border-white/10 dark:bg-[#111713]/80">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#c5ff3f] font-bold text-[#151a16] lg:hidden">
              C
            </div>
            <div>
              <p className="mono text-[9px] uppercase tracking-[0.2em] text-[#75816f]">
                Workspace /{" "}
                {location === "/" ? "Overview" : location.replace("/", "")}
              </p>
              <h1 className="mt-1 text-lg font-semibold tracking-[-0.04em] sm:text-xl">
                {pageTitle}
                {location === "/" && (
                  <span className="text-[#95aa84]">
                    , {user?.name?.split(" ")[0] || "оператор"}
                  </span>
                )}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-[#dfe2d6] bg-[#fffdf7] px-3 py-2 text-[11px] text-[#6e796b] sm:flex dark:border-white/10 dark:bg-[#171f19] dark:text-[#a8b5a3]">
              <span className="status-dot online" /> API online{" "}
              <span className="mono text-[10px]">24ms</span>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => toggleTheme?.()}
              aria-label={getThemeToggleLabel(theme)}
              title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              className="h-9 w-9 rounded-xl text-[#6f7c6d] hover:bg-[#e7e9dc] dark:text-[#a8b5a3] dark:hover:bg-[#253025]"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-9 w-9 rounded-xl text-[#6f7c6d] hover:bg-[#e7e9dc] dark:hover:bg-[#253025]"
            >
              <Activity className="h-4 w-4" />
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#ff768d]" />
            </Button>
            <Button
              onClick={() => setCreateOpen(true)}
              className="h-9 rounded-xl bg-[#c5ff3f] px-3 text-xs font-semibold text-[#151a16] hover:bg-[#d8ff78] sm:px-4"
            >
              <Plus className="mr-1.5 h-4 w-4" />{" "}
              <span className="hidden sm:inline">Новый сервер</span>
              <span className="sm:hidden">Новый</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] space-y-7 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        {location === "/library" ? (
          <CatalogView
            activeServer={activeServer}
            installed={installationsQuery.data ?? []}
            onInstall={item =>
              activeServer &&
              installMutation.mutate({
                serverId: activeServer.id,
                catalogType: item.catalogType,
                name: item.title,
                version: item.version,
              })
            }
            onFiles={() => setLocation(activeServer ? "/files" : "/servers")}
          />
        ) : location === "/backups" ? (
          <BackupsView
            server={activeServer}
            backups={backupsQuery.data ?? []}
            onAction={(id, action) => backupMutation.mutate({ id, action })}
            onCreate={() =>
              activeServer &&
              createBackupMutation.mutate({
                serverId: activeServer.id,
                name: `Ручная копия · ${new Date().toLocaleDateString("ru-RU")}`,
              })
            }
          />
        ) : location === "/files" ? (
          activeServer ? (
            <FileManagerView server={activeServer} />
          ) : (
            <EmptyFleet onCreate={() => setCreateOpen(true)} />
          )
        ) : location === "/settings" ? (
          <SettingsView userName={user?.name ?? ""} />
        ) : location === "/help" ? (
          <HelpView />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-[1.55fr_0.85fr]">
              <div className="relative overflow-hidden rounded-[28px] bg-[#151c16] p-6 text-[#edf4e8] shadow-[0_24px_70px_rgba(16,28,17,.16)] sm:p-8 lg:p-10">
                <div className="absolute -right-16 -top-24 h-72 w-72 rounded-full bg-[#c5ff3f]/10 blur-2xl" />
                <div className="absolute -bottom-32 right-24 h-72 w-72 rounded-full border-[40px] border-[#c5ff3f]/[0.06]" />
                <div className="relative z-10 max-w-2xl">
                  <div className="mb-9 flex items-center gap-2">
                    <span className="mono rounded-full border border-[#c5ff3f]/25 px-2.5 py-1 text-[9px] uppercase tracking-[0.17em] text-[#c5ff3f]">
                      Live infrastructure
                    </span>
                    <span className="text-[11px] text-[#849182]">
                      updated just now
                    </span>
                  </div>
                  <h2 className="display-title max-w-lg text-[#f2f7ed]">
                    Три мира.
                    <br />
                    <span className="text-[#c5ff3f]">Один спокойный</span>{" "}
                    контроль.
                  </h2>
                  <p className="mt-6 max-w-md text-sm leading-6 text-[#a7b3a5]">
                    Собрали всё важное на одном экране: состояние серверов,
                    нагрузка и быстрые действия без лишнего шума.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-3">
                    <Button
                      onClick={() => setLocation("/servers")}
                      className="h-11 rounded-xl bg-[#c5ff3f] px-4 text-xs font-semibold text-[#151a16] hover:bg-[#d8ff78]"
                    >
                      Открыть серверы <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => setLocation("/library")}
                      className="h-11 rounded-xl border-white/15 bg-transparent px-4 text-xs text-[#e8f0e5] hover:bg-white/10 hover:text-white"
                    >
                      Каталог расширений
                    </Button>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-2">
                <SummaryCard
                  label="Всего серверов"
                  value={String(servers.length).padStart(2, "0")}
                  detail={`${onlineCount} работают`}
                  accent="lime"
                  icon={<Server className="h-4 w-4" />}
                />
                <SummaryCard
                  label="Игроки онлайн"
                  value={String(totalPlayers).padStart(2, "0")}
                  detail="сейчас в мире"
                  accent="blue"
                  icon={<Users className="h-4 w-4" />}
                />
                <SummaryCard
                  label="Средний TPS"
                  value={
                    servers.length
                      ? String(
                          Math.round(
                            servers.reduce((n, s) => n + s.tps, 0) /
                              servers.length
                          )
                        )
                      : "—"
                  }
                  detail="за последние 5 минут"
                  accent="orange"
                  icon={<Zap className="h-4 w-4" />}
                />
                <SummaryCard
                  label="Бэкапы"
                  value={String(backupsQuery.data?.length ?? 0).padStart(
                    2,
                    "0"
                  )}
                  detail="последняя копия сегодня"
                  accent="pink"
                  icon={<CloudDownload className="h-4 w-4" />}
                />
              </div>
            </section>

            <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <p className="mono mb-2 text-[10px] uppercase tracking-[0.18em] text-[#8b9586]">
                  Servers / fleet overview
                </p>
                <h2 className="text-2xl font-semibold tracking-[-0.05em] sm:text-3xl">
                  Твоя инфраструктура
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs text-[#788374]">
                  <span className="status-dot online" /> {onlineCount} online
                </div>
                <Separator orientation="vertical" className="mx-2 h-4" />
                <Button
                  variant="ghost"
                  onClick={() => serversQuery.refetch()}
                  className="h-8 rounded-lg px-2 text-xs text-[#717d6f] hover:bg-[#e5e8db] dark:hover:bg-[#253025]"
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Обновить
                </Button>
              </div>
            </section>

            {serversQuery.isLoading ? (
              <LoadingFleet />
            ) : servers.length === 0 ? (
              <EmptyFleet onCreate={() => setCreateOpen(true)} />
            ) : (
              <div className="grid gap-5 xl:grid-cols-3">
                {servers.map(server => (
                  <ServerCard
                    key={server.id}
                    server={server}
                    active={activeServer?.id === server.id}
                    onSelect={() => setActiveServerId(server.id)}
                    onAction={action => {
                      setActiveServerId(server.id);
                      actionMutation.mutate({ id: server.id, action });
                    }}
                  />
                ))}
                <QuickAddCard onClick={() => setCreateOpen(true)} />
              </div>
            )}

            {activeServer && (
              <section className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
                <LiveConsole
                  server={activeServer}
                  logs={visibleLogs}
                  loading={logsQuery.isLoading}
                  filter={logFilter}
                  onFilterChange={setLogFilter}
                  fallbackOutput={commandOutput}
                  command={command}
                  onCommandChange={setCommand}
                  onSubmit={sendCommand}
                  commandPending={actionMutation.isPending}
                />
                <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
                  <CardHeader className="px-5 pb-3 pt-5 sm:px-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
                          Selected node
                        </p>
                        <CardTitle className="mt-1 text-xl tracking-[-0.04em]">
                          {activeServer.name}
                        </CardTitle>
                      </div>
                      <StatusBadge status={activeServer.status} />
                    </div>
                    <div className="mt-4 flex items-center gap-2 rounded-lg bg-[#eff2e7] px-3 py-2 dark:bg-[#202a21]">
                      <span className="mono truncate text-[10px] text-[#637061] dark:text-[#a0ae9a]">
                        {activeServer.address || "address pending"}
                      </span>
                      <button
                        onClick={copyAddress}
                        className="ml-auto text-[#74816f] hover:text-[#151a16] dark:hover:text-white"
                        aria-label="Скопировать адрес"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5 sm:px-6">
                    <div className="grid grid-cols-2 gap-2">
                      <ActionButton
                        icon={<Play />}
                        label="Запустить"
                        onClick={() => runServerAction("start")}
                        disabled={
                          activeServer.status === "online" ||
                          actionMutation.isPending
                        }
                        primary
                      />
                      <ActionButton
                        icon={<Square />}
                        label="Остановить"
                        onClick={() => runServerAction("stop")}
                        disabled={
                          activeServer.status === "offline" ||
                          actionMutation.isPending
                        }
                      />
                      <ActionButton
                        icon={<RefreshCw />}
                        label="Перезапустить"
                        onClick={() => runServerAction("restart")}
                        disabled={actionMutation.isPending}
                      />
                      <ActionButton
                        icon={<FolderOpen />}
                        label="Файлы"
                        onClick={() => setLocation("/files")}
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#778274]">Сборка</span>
                      <span className="font-medium">
                        {activeServer.core}{" "}
                        <span className="text-[#9aa597]">
                          {activeServer.version}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#778274]">Тип подключения</span>
                      <span className="font-medium capitalize">
                        {activeServer.serverType}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#778274]">Аптайм</span>
                      <span className="mono text-[10px] text-[#778274]">
                        {activeServer.status === "online" ? "12д 04ч 18м" : "—"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {activeServer && (
              <section className="rounded-[24px] border border-[#dfe2d6] bg-[#fffdf7] p-5 panel-shadow dark:border-white/10 dark:bg-[#171f19] sm:p-6">
                <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
                      Node telemetry
                    </p>
                    <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                      Ресурсы в реальном времени
                    </h2>
                  </div>
                  <span className="mono text-[10px] text-[#8b9586]">
                    polling / 5 sec
                  </span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                  <ResourceMetric
                    icon={<Activity />}
                    label="TPS"
                    value={String(activeServer.tps || "—")}
                    suffix="/ 20"
                    progress={(activeServer.tps / 20) * 100}
                    tone="lime"
                    note={
                      activeServer.tps >= 19 ? "стабильно" : "нужна проверка"
                    }
                  />
                  <ResourceMetric
                    icon={<MemoryStick />}
                    label="RAM"
                    value={(activeServer.ramUsedMb / 1024).toFixed(1)}
                    suffix={` / ${(activeServer.ramTotalMb / 1024).toFixed(0)} GB`}
                    progress={percent(
                      activeServer.ramUsedMb,
                      activeServer.ramTotalMb
                    )}
                    tone="blue"
                    note={`${percent(activeServer.ramUsedMb, activeServer.ramTotalMb)}% использовано`}
                  />
                  <ResourceMetric
                    icon={<Cpu />}
                    label="CPU"
                    value={String(activeServer.cpuPercent)}
                    suffix="%"
                    progress={activeServer.cpuPercent}
                    tone="orange"
                    note="1 dedicated core"
                  />
                  <ResourceMetric
                    icon={<HardDrive />}
                    label="Disk"
                    value={String(activeServer.diskUsedGb)}
                    suffix={` / ${activeServer.diskTotalGb} GB`}
                    progress={percent(
                      activeServer.diskUsedGb,
                      activeServer.diskTotalGb
                    )}
                    tone="pink"
                    note={`${activeServer.diskTotalGb - activeServer.diskUsedGb} GB свободно`}
                  />
                </div>
              </section>
            )}

            {activeServer && <MetricCharts history={chartData} />}

            {activeServer && (
              <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
                  <CardHeader className="px-5 pb-1 pt-5 sm:px-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
                          Configuration
                        </p>
                        <CardTitle className="mt-1 text-xl tracking-[-0.04em]">
                          Основные настройки
                        </CardTitle>
                      </div>
                      <FileCog className="h-5 w-5 text-[#8b9586]" />
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-6 pt-5 sm:px-6">
                    <Tabs defaultValue="server">
                      <TabsList className="mb-5 h-9 bg-[#eff2e7] p-1 dark:bg-[#202a21]">
                        <TabsTrigger
                          value="server"
                          className="h-7 rounded-md px-3 text-[11px] data-[state=active]:bg-[#fffdf7] data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#2b372c]"
                        >
                          Сервер
                        </TabsTrigger>
                        <TabsTrigger
                          value="gameplay"
                          className="h-7 rounded-md px-3 text-[11px] data-[state=active]:bg-[#fffdf7] data-[state=active]:shadow-sm dark:data-[state=active]:bg-[#2b372c]"
                        >
                          Геймплей
                        </TabsTrigger>
                      </TabsList>
                      <TabsContent value="server" className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <ConfigSelect
                            label="Платформа"
                            value={configDraft.serverType}
                            options={[
                              { value: "java", label: "Java Edition" },
                              { value: "bedrock", label: "Bedrock Edition" },
                            ]}
                            onChange={value =>
                              setConfigDraft(draft => ({
                                ...draft,
                                serverType: value as "java" | "bedrock",
                              }))
                            }
                          />
                          <ConfigSelect
                            label="Ядро"
                            value={configDraft.core}
                            options={[
                              { value: "Paper", label: "Paper" },
                              { value: "Fabric", label: "Fabric" },
                              { value: "Vanilla", label: "Vanilla" },
                              { value: "Forge", label: "Forge" },
                            ]}
                            onChange={value =>
                              setConfigDraft(draft => ({
                                ...draft,
                                core: value,
                              }))
                            }
                          />
                          <ConfigSelect
                            label="Версия"
                            value={configDraft.version}
                            options={[
                              { value: "1.21.1", label: "1.21.1" },
                              { value: "1.21", label: "1.21" },
                              { value: "1.20.4", label: "1.20.4" },
                            ]}
                            onChange={value =>
                              setConfigDraft(draft => ({
                                ...draft,
                                version: value,
                              }))
                            }
                          />
                          <div className="space-y-2">
                            <Label className="text-[11px] text-[#687566]">
                              Лимит игроков
                            </Label>
                            <Input
                              type="number"
                              min={1}
                              max={500}
                              value={configDraft.maxPlayers}
                              onChange={event =>
                                setConfigDraft(draft => ({
                                  ...draft,
                                  maxPlayers: Number(event.target.value),
                                }))
                              }
                              className="h-10 rounded-lg border-[#dfe2d6] bg-[#f7f6ef] text-sm dark:border-white/10 dark:bg-[#202a21]"
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-[11px] text-[#687566]">
                            MOTD сервера
                          </Label>
                          <Textarea
                            value={configDraft.motd}
                            onChange={event =>
                              setConfigDraft(draft => ({
                                ...draft,
                                motd: event.target.value,
                              }))
                            }
                            className="min-h-20 resize-none rounded-lg border-[#dfe2d6] bg-[#f7f6ef] text-sm dark:border-white/10 dark:bg-[#202a21]"
                            placeholder="Описание, которое увидят игроки"
                          />
                        </div>
                      </TabsContent>
                      <TabsContent value="gameplay" className="space-y-4">
                        <ToggleRow
                          label="PvP между игроками"
                          description="Разрешить урон от других игроков"
                          checked={configDraft.pvp}
                          onChange={checked =>
                            setConfigDraft(draft => ({
                              ...draft,
                              pvp: checked,
                            }))
                          }
                        />
                        <ToggleRow
                          label="Проверка аккаунтов"
                          description="Только лицензированные аккаунты"
                          checked={configDraft.onlineMode}
                          onChange={checked =>
                            setConfigDraft(draft => ({
                              ...draft,
                              onlineMode: checked,
                            }))
                          }
                        />
                      </TabsContent>
                    </Tabs>
                    <Button
                      onClick={saveConfig}
                      disabled={configMutation.isPending}
                      className="mt-5 h-10 rounded-lg bg-[#151a16] px-4 text-xs font-semibold text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16] dark:hover:bg-[#d8ff78]"
                    >
                      <Save className="mr-2 h-3.5 w-3.5" />{" "}
                      {configMutation.isPending
                        ? "Сохраняем…"
                        : "Сохранить настройки"}
                    </Button>
                  </CardContent>
                </Card>
                <CatalogRail
                  onCatalog={() => setLocation("/library")}
                  onFiles={() => setLocation("/files")}
                />
              </section>
            )}
          </>
        )}
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] dark:border-white/10 dark:bg-[#171f19]">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-[-0.04em]">
              Добавить Minecraft-сервер
            </DialogTitle>
            <DialogDescription className="text-sm leading-6 text-[#74806f]">
              Выбери базовую конфигурацию. Остальное можно изменить после
              создания.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-3">
            <div className="space-y-2">
              <Label className="text-[11px] text-[#687566]">Название</Label>
              <Input
                autoFocus
                value={newServer.name}
                onChange={event =>
                  setNewServer(server => ({
                    ...server,
                    name: event.target.value,
                  }))
                }
                placeholder="Например, Luna SMP"
                className="h-11 rounded-lg bg-[#f7f6ef] dark:bg-[#202a21]"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <ConfigSelect
                label="Платформа"
                value={newServer.serverType}
                options={[
                  { value: "java", label: "Java Edition" },
                  { value: "bedrock", label: "Bedrock Edition" },
                ]}
                onChange={value =>
                  setNewServer(server => ({
                    ...server,
                    serverType: value as "java" | "bedrock",
                  }))
                }
              />
              <ConfigSelect
                label="Ядро"
                value={newServer.core}
                options={[
                  { value: "Paper", label: "Paper" },
                  { value: "Fabric", label: "Fabric" },
                  { value: "Vanilla", label: "Vanilla" },
                ]}
                onChange={value =>
                  setNewServer(server => ({ ...server, core: value }))
                }
              />
              <ConfigSelect
                label="Версия"
                value={newServer.version}
                options={[
                  { value: "1.21.1", label: "1.21.1" },
                  { value: "1.21", label: "1.21" },
                  { value: "1.20.4", label: "1.20.4" },
                ]}
                onChange={value =>
                  setNewServer(server => ({ ...server, version: value }))
                }
              />
              <div className="space-y-2">
                <Label className="text-[11px] text-[#687566]">
                  Лимит игроков
                </Label>
                <Input
                  type="number"
                  value={newServer.maxPlayers}
                  onChange={event =>
                    setNewServer(server => ({
                      ...server,
                      maxPlayers: Number(event.target.value),
                    }))
                  }
                  className="h-10 rounded-lg bg-[#f7f6ef] dark:bg-[#202a21]"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="rounded-lg"
            >
              Отмена
            </Button>
            <Button
              onClick={() => createMutation.mutate(newServer)}
              disabled={!newServer.name.trim() || createMutation.isPending}
              className="rounded-lg bg-[#151a16] text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16]"
            >
              {createMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Plus className="mr-2 h-4 w-4" />
              )}{" "}
              Создать сервер
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCharts({
  history,
}: {
  history: Array<MetricPoint & { time: string }>;
}) {
  const plots = [
    {
      key: "cpu",
      label: "CPU",
      value: history.at(-1)?.cpu ?? 0,
      suffix: "%",
      color: "#f0a35a",
      gradient: "cpuGradient",
      domain: [0, 100] as [number, number],
    },
    {
      key: "ram",
      label: "RAM",
      value: history.at(-1)?.ram ?? 0,
      suffix: "%",
      color: "#789cff",
      gradient: "ramGradient",
      domain: [0, 100] as [number, number],
    },
    {
      key: "players",
      label: "Игроки",
      value: history.at(-1)?.players ?? 0,
      suffix: " онлайн",
      color: "#b8e957",
      gradient: "playersGradient",
      domain: [0, "auto"] as [number, "auto"],
    },
  ] as const;

  return (
    <section className="rounded-[24px] border border-[#dfe2d6] bg-[#fffdf7] p-5 panel-shadow dark:border-white/10 dark:bg-[#171f19] sm:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
            Live history / 36 points
          </p>
          <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]">
            Нагрузка в реальном времени
          </h2>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-[#899386]">
          <span className="status-dot online" /> обновляется каждые 5 сек
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {plots.map(plot => (
          <div
            key={plot.key}
            className="rounded-2xl border border-[#e5e8dd] bg-[#f7f6ef] p-4 dark:border-white/10 dark:bg-[#202a21]"
          >
            <div className="mb-2 flex items-end justify-between gap-2">
              <div>
                <p className="text-[10px] text-[#899386]">{plot.label}</p>
                <p className="mt-1 text-xl font-semibold tracking-[-0.05em]">
                  {plot.value.toFixed(plot.key === "players" ? 0 : 1)}
                  <span className="ml-1 text-[10px] font-normal text-[#899386]">
                    {plot.suffix}
                  </span>
                </p>
              </div>
              <span className="mono text-[9px] text-[#899386]">
                {history.length ? `${history.length} pts` : "ожидание"}
              </span>
            </div>
            <div className="h-32">
              {history.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={history}
                    margin={{ top: 8, right: 2, left: -24, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient
                        id={plot.gradient}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="0%"
                          stopColor={plot.color}
                          stopOpacity={0.35}
                        />
                        <stop
                          offset="100%"
                          stopColor={plot.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="currentColor"
                      strokeOpacity={0.08}
                      vertical={false}
                    />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={plot.domain} hide />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 10,
                        border: "1px solid rgba(148,163,134,.25)",
                        background: "#151c16",
                        color: "#edf4e8",
                        fontSize: 11,
                      }}
                      labelStyle={{ color: "#a7b3a5", fontSize: 10 }}
                    />
                    <Area
                      type="monotone"
                      dataKey={plot.key}
                      stroke={plot.color}
                      strokeWidth={2}
                      fill={`url(#${plot.gradient})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-[#d8ddd0] text-[10px] text-[#899386] dark:border-white/10">
                  Собираем первые данные…
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SummaryCard({
  label,
  value,
  detail,
  accent,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  accent: string;
  icon: React.ReactNode;
}) {
  return (
    <Card className="rounded-[20px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
      <CardContent className="p-4 sm:p-5">
        <div
          className={cn(
            "mb-5 flex h-8 w-8 items-center justify-center rounded-lg",
            accent === "lime"
              ? "bg-[#edf6c9] text-[#71952a]"
              : accent === "blue"
                ? "bg-[#e6edff] text-[#6489dd]"
                : accent === "orange"
                  ? "bg-[#fff0dc] text-[#dc9251]"
                  : "bg-[#ffe5ea] text-[#d56e82]"
          )}
        >
          {icon}
        </div>
        <p className="text-[11px] text-[#788374]">{label}</p>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-2xl font-semibold tracking-[-0.06em]">
            {value}
          </span>
          <span className="mb-1 truncate text-[10px] text-[#8b9586]">
            {detail}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ServerCard({
  server,
  active,
  onSelect,
  onAction,
}: {
  server: Server;
  active: boolean;
  onSelect: () => void;
  onAction: (action: "start" | "stop" | "restart") => void;
}) {
  const isOnline = server.status === "online";
  return (
    <Card
      onClick={onSelect}
      className={cn(
        "group cursor-pointer rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#b8c7a9] hover:shadow-[0_18px_46px_rgba(21,30,20,.1)] dark:border-white/10 dark:bg-[#171f19] dark:hover:border-[#526650]",
        active &&
          "border-[#a6c86b] ring-2 ring-[#c5ff3f]/25 dark:border-[#829d5d]"
      )}
    >
      <CardHeader className="p-5 pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl text-xs font-semibold",
                isOnline
                  ? "bg-[#eaf6c3] text-[#6e8f2b]"
                  : "bg-[#e8eae4] text-[#788374] dark:bg-[#273128]"
              )}
            >
              <Gamepad2 className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-sm tracking-[-0.02em]">
                {server.name}
              </CardTitle>
              <p className="mono mt-1 text-[9px] uppercase tracking-[0.12em] text-[#8b9586]">
                {server.serverType} · {server.core} {server.version}
              </p>
            </div>
          </div>
          <MoreHorizontal className="h-4 w-4 text-[#9ca69a]" />
        </div>
        <div className="mt-5 flex items-center justify-between">
          <StatusBadge status={server.status} />
          <span className="mono text-[10px] text-[#8b9586]">
            {server.address?.split(".")[0] || "pending"}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pb-5">
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-[#f3f4ec] p-3 dark:bg-[#202a21]">
          <SmallStat
            label="Игроки"
            value={`${server.playersOnline}/${server.maxPlayers}`}
          />
          <SmallStat label="TPS" value={server.tps ? `${server.tps}` : "—"} />
          <SmallStat
            label="RAM"
            value={`${(server.ramUsedMb / 1024).toFixed(1)}G`}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniMetric
            label="CPU"
            value={`${server.cpuPercent}%`}
            progress={server.cpuPercent}
            tone="orange"
          />
          <MiniMetric
            label="Disk"
            value={`${percent(server.diskUsedGb, server.diskTotalGb)}%`}
            progress={percent(server.diskUsedGb, server.diskTotalGb)}
            tone="pink"
          />
        </div>
        <div className="flex gap-2 pt-1">
          <Button
            onClick={event => {
              event.stopPropagation();
              onAction(isOnline ? "restart" : "start");
            }}
            className="h-9 flex-1 rounded-lg bg-[#151a16] text-[11px] font-semibold text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16] dark:hover:bg-[#d8ff78]"
          >
            <Play className="mr-1.5 h-3.5 w-3.5" />
            {isOnline ? "Перезапустить" : "Запустить"}
          </Button>
          <Button
            onClick={event => {
              event.stopPropagation();
              onAction(isOnline ? "stop" : "start");
            }}
            variant="outline"
            className="h-9 rounded-lg border-[#dfe2d6] px-3 text-[#6f7c6d] dark:border-white/10"
          >
            {isOnline ? (
              <Square className="h-3.5 w-3.5" />
            ) : (
              <Settings2 className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: Server["status"] }) {
  const copy =
    status === "online"
      ? "Работает"
      : status === "offline"
        ? "Остановлен"
        : status === "starting"
          ? "Запускается"
          : "Останавливается";
  return (
    <span className="inline-flex items-center gap-2 text-[10px] font-medium text-[#637061]">
      <span
        className={cn(
          "status-dot",
          status === "online"
            ? "online"
            : status === "offline"
              ? "offline"
              : "warning"
        )}
      />
      {copy}
    </span>
  );
}
function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-[#889386]">{label}</p>
      <p className="mono mt-1 text-[12px] font-medium">{value}</p>
    </div>
  );
}
function MiniMetric({
  label,
  value,
  progress,
  tone,
}: {
  label: string;
  value: string;
  progress: number;
  tone: "orange" | "pink";
}) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[9px] text-[#899386]">
        <span>{label}</span>
        <span className="mono">{value}</span>
      </div>
      <div className={cn("metric-bar", tone)}>
        <span style={{ width: `${Math.min(100, progress)}%` }} />
      </div>
    </div>
  );
}
function ResourceMetric({
  icon,
  label,
  value,
  suffix,
  progress,
  tone,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  progress: number;
  tone: "lime" | "blue" | "orange" | "pink";
  note: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-[#768271]">
        <span
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-lg",
            tone === "lime"
              ? "bg-[#edf6c9] text-[#72952b]"
              : tone === "blue"
                ? "bg-[#e6edff] text-[#6489dd]"
                : tone === "orange"
                  ? "bg-[#fff0dc] text-[#dc9251]"
                  : "bg-[#ffe5ea] text-[#d56e82]"
          )}
        >
          {icon}
        </span>
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-[-0.06em]">
          {value}
        </span>
        <span className="mono text-[10px] text-[#899386]">{suffix}</span>
      </div>
      <div
        className={cn(
          "metric-bar mt-3",
          tone === "blue"
            ? "blue"
            : tone === "orange"
              ? "orange"
              : tone === "pink"
                ? "pink"
                : ""
        )}
      >
        <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
      <p className="mt-2 text-[10px] text-[#8b9586]">{note}</p>
    </div>
  );
}
function ActionButton({
  icon,
  label,
  onClick,
  disabled,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      variant={primary ? "default" : "outline"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "h-9 rounded-lg px-2 text-[10px]",
        primary
          ? "bg-[#151a16] text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16]"
          : "border-[#dfe2d6] text-[#697668] dark:border-white/10"
      )}
    >
      {icon && (
        <span className="mr-1.5 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
      )}
      {label}
    </Button>
  );
}
function ConfigSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-[11px] text-[#687566]">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-10 rounded-lg border-[#dfe2d6] bg-[#f7f6ef] text-xs dark:border-white/10 dark:bg-[#202a21]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(option => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-[#e5e8dd] p-3 dark:border-white/10">
      <div>
        <p className="text-xs font-medium">{label}</p>
        <p className="mt-1 text-[10px] text-[#899386]">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
function CatalogRail({
  onCatalog,
  onFiles,
}: {
  onCatalog: () => void;
  onFiles: () => void;
}) {
  return (
    <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
      <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
              One-click installs
            </p>
            <CardTitle className="mt-1 text-xl tracking-[-0.04em]">
              Расширения
            </CardTitle>
          </div>
          <Button
            variant="ghost"
            onClick={onCatalog}
            className="h-8 rounded-lg px-2 text-[11px] text-[#74816f]"
          >
            Весь каталог <ChevronRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-5 pb-5 sm:px-6">
        {catalog.map(item => (
          <div
            key={item.title}
            className="flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#f1f3e9] dark:hover:bg-[#202a21]"
          >
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br text-[10px] font-semibold text-white",
                item.color
              )}
            >
              {item.image}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{item.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-[#899386]">
                {item.type} · {item.meta}
              </p>
            </div>
            <button
              onClick={onCatalog}
              className="rounded-lg border border-[#dfe2d6] p-2 text-[#75816f] hover:bg-[#fffdf7] dark:border-white/10 dark:hover:bg-[#2b372c]"
              aria-label={`Установить ${item.title}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <Button
          variant="outline"
          onClick={onFiles}
          className="mt-2 h-9 w-full rounded-lg border-dashed border-[#cbd3c1] text-[10px] text-[#70806d] dark:border-white/15"
        >
          <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Открыть файловый
          менеджер
        </Button>
      </CardContent>
    </Card>
  );
}

type ConsoleLog = {
  id: number;
  level: "system" | "info" | "warn" | "error" | "debug";
  source: string;
  message: string;
  createdAt: Date | string | number;
};

function LiveConsole({
  server,
  logs,
  loading,
  filter,
  onFilterChange,
  fallbackOutput,
  command,
  onCommandChange,
  onSubmit,
  commandPending,
}: {
  server: Server;
  logs: ConsoleLog[];
  loading: boolean;
  filter: "all" | ConsoleLog["level"];
  onFilterChange: (filter: "all" | ConsoleLog["level"]) => void;
  fallbackOutput: string;
  command: string;
  onCommandChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  commandPending: boolean;
}) {
  const levelClass = (level: ConsoleLog["level"]) =>
    level === "error"
      ? "text-[#ff7894]"
      : level === "warn"
        ? "text-[#ffbd75]"
        : level === "debug"
          ? "text-[#9da9ff]"
          : level === "system"
            ? "text-[#c5ff3f]"
            : "text-[#aebca8]";
  const filters: { value: "all" | ConsoleLog["level"]; label: string }[] = [
    { value: "all", label: "Все" },
    { value: "system", label: "Система" },
    { value: "info", label: "Info" },
    { value: "warn", label: "Warn" },
    { value: "error", label: "Error" },
    { value: "debug", label: "Debug" },
  ];
  return (
    <Card className="overflow-hidden rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
      <CardHeader className="border-b border-[#e6e8de] px-5 py-4 dark:border-white/10 sm:px-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-[#8ba8ff]" />
              <CardTitle className="text-sm font-semibold tracking-[-0.02em]">
                Консоль · {server.name}
              </CardTitle>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <p className="mono text-[10px] text-[#8b9586]">
                live server log stream
              </p>
              <span className="inline-flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-[#789d34]">
                <span className="status-dot online" /> LIVE
              </span>
            </div>
          </div>
          <Badge
            variant="outline"
            className="mono rounded-md border-[#dfe2d6] px-2 py-1 text-[9px] font-normal text-[#7a8677] dark:border-white/10"
          >
            {server.status === "online" ? "CONNECTED" : "STANDBY"}
          </Badge>
        </div>
        <div className="mt-4 flex max-w-full gap-1 overflow-x-auto pb-0.5">
          {filters.map(item => (
            <button
              key={item.value}
              type="button"
              onClick={() => onFilterChange(item.value)}
              className={cn(
                "shrink-0 rounded-md px-2 py-1 text-[9px] font-medium transition-colors",
                filter === item.value
                  ? "bg-[#eaf6c3] text-[#5f8122] dark:bg-[#314126] dark:text-[#c5ff3f]"
                  : "text-[#899386] hover:bg-[#f0f2e8] dark:hover:bg-[#202a21]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div
          className="min-h-[260px] max-h-[360px] overflow-y-auto bg-[#111713] px-4 py-5 font-mono text-[10px] leading-5 text-[#aebca8] sm:px-6"
          aria-live="polite"
          aria-label="Поток логов Minecraft-сервера"
        >
          {loading ? (
            <div className="flex items-center gap-2 text-[#738570]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Подключаем поток
              логов…
            </div>
          ) : visibleConsoleLogs(logs, fallbackOutput).length ? (
            visibleConsoleLogs(logs, fallbackOutput).map(log => (
              <div key={log.id} className="flex gap-2 py-0.5">
                <span className="shrink-0 text-[#60715f]">
                  [{formatTime(log.createdAt)}]
                </span>
                <span
                  className={cn(
                    "w-12 shrink-0 uppercase",
                    levelClass(log.level)
                  )}
                >
                  [{log.level}]
                </span>
                <span className="text-[#93a28f]">{log.source}:</span>
                <span
                  className={cn("min-w-0 break-words", levelClass(log.level))}
                >
                  {log.message}
                </span>
              </div>
            ))
          ) : (
            <div className="text-[#738570]">
              [craftpanel] Ожидание первых записей от сервера…
            </div>
          )}
          <div className="mt-3 flex items-center gap-2 text-[#c5ff3f]">
            <span>›</span>
            <span className="h-3 w-px animate-pulse bg-[#c5ff3f]" />
          </div>
        </div>
        <form
          onSubmit={onSubmit}
          className="flex gap-2 border-t border-[#273329] bg-[#151c16] p-3 sm:p-4"
        >
          <Input
            value={command}
            onChange={event => onCommandChange(event.target.value)}
            placeholder="Например: say Добро пожаловать!"
            className="h-10 border-white/10 bg-[#111713] font-mono text-[11px] text-[#edf4e8] placeholder:text-[#647363] focus-visible:ring-[#c5ff3f]"
          />
          <Button
            type="submit"
            disabled={!command.trim() || commandPending}
            aria-label="Отправить команду"
            className="h-10 rounded-lg bg-[#c5ff3f] px-3 text-[#151a16] hover:bg-[#d8ff78]"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function visibleConsoleLogs(
  logs: ConsoleLog[],
  fallbackOutput: string
): ConsoleLog[] {
  if (logs.length) return logs;
  return [
    {
      id: 0,
      level: "system",
      source: "craftpanel",
      message: fallbackOutput,
      createdAt: new Date(),
    },
  ];
}

function FileManagerView({ server }: { server: Server }) {
  const [parentPath, setParentPath] = useState("/");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"file" | "folder">("file");
  const utils = trpc.useUtils();
  const filesQuery = trpc.servers.files.list.useQuery({
    serverId: server.id,
    parentPath,
  });
  const createMutation = trpc.servers.files.create.useMutation({
    onSuccess: async () => {
      setCreateOpen(false);
      setName("");
      await utils.servers.files.list.invalidate({
        serverId: server.id,
        parentPath,
      });
      toast.success("Изменение сохранено в файловом менеджере");
    },
    onError: error =>
      toast.error(error.message || "Не удалось создать элемент"),
  });
  const deleteMutation = trpc.servers.files.delete.useMutation({
    onSuccess: async () => {
      await utils.servers.files.list.invalidate({
        serverId: server.id,
        parentPath,
      });
      toast.success("Элемент удалён");
    },
    onError: error =>
      toast.error(error.message || "Не удалось удалить элемент"),
  });
  const files = filesQuery.data ?? [];
  const segments =
    parentPath === "/" ? [] : parentPath.split("/").filter(Boolean);
  const goUp = () =>
    setParentPath(
      parentPath === "/"
        ? "/"
        : parentPath.split("/").slice(0, -1).join("/") || "/"
    );
  const createFile = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createMutation.mutate({
      serverId: server.id,
      parentPath,
      name: name.trim(),
      kind,
    });
  };
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-[28px] bg-[#151c16] p-6 text-[#edf4e8] sm:flex-row sm:items-end sm:p-8">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[#c5ff3f]">
            File workspace
          </span>
          <h2 className="display-title mt-3 max-w-xl">
            Файлы сервера
            <br />
            <span className="text-[#c5ff3f]">без лишних окон.</span>
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[#a7b3a5]">
            Редактируй структуру {server.name}, добавляй конфиги и держи мир под
            рукой.
          </p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="h-11 rounded-xl bg-[#c5ff3f] text-xs font-semibold text-[#151a16] hover:bg-[#d8ff78]"
        >
          <Plus className="mr-2 h-4 w-4" /> Новый элемент
        </Button>
      </section>
      <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
        <CardHeader className="border-b border-[#e7e9df] px-5 py-4 dark:border-white/10 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => setParentPath("/")}
                className="font-medium hover:text-[#789a34]"
              >
                {server.name}
              </button>
              {segments.map(segment => (
                <span
                  key={segment}
                  className="flex items-center gap-2 text-[#899386]"
                >
                  <ChevronRight className="h-3 w-3" />
                  {segment}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={goUp}
                disabled={parentPath === "/"}
                className="h-8 rounded-lg border-[#dfe2d6] px-3 text-[10px] dark:border-white/10"
              >
                <ArrowUpRight className="mr-1.5 h-3.5 w-3.5 -rotate-45" /> Вверх
              </Button>
              <Button
                variant="outline"
                onClick={() => filesQuery.refetch()}
                className="h-8 rounded-lg border-[#dfe2d6] px-3 text-[10px] dark:border-white/10"
              >
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Обновить
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filesQuery.isLoading ? (
            <div className="p-8 text-center text-xs text-[#899386]">
              Загружаем дерево файлов…
            </div>
          ) : files.length ? (
            <div className="divide-y divide-[#e7e9df] dark:divide-white/10">
              {files.map(file => (
                <div
                  key={file.id}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#f4f5ed] dark:hover:bg-[#202a21]"
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      file.kind === "folder"
                        ? "bg-[#fff0dc] text-[#d69651]"
                        : "bg-[#e8edff] text-[#6d8de2]"
                    )}
                  >
                    {file.kind === "folder" ? (
                      <FolderOpen className="h-4 w-4" />
                    ) : (
                      <FileStack className="h-4 w-4" />
                    )}
                  </div>
                  <button
                    onClick={() =>
                      file.kind === "folder" &&
                      setParentPath(
                        `${parentPath === "/" ? "" : parentPath}/${file.name}`
                      )
                    }
                    className={cn(
                      "min-w-0 flex-1 text-left",
                      file.kind === "folder" && "hover:text-[#779d31]"
                    )}
                  >
                    <p className="truncate text-xs font-medium">{file.name}</p>
                    <p className="mono mt-1 text-[10px] text-[#899386]">
                      {file.kind === "folder"
                        ? "папка"
                        : `${file.sizeBytes} bytes`}
                    </p>
                  </button>
                  {file.kind === "file" && (
                    <Badge
                      variant="outline"
                      className="hidden rounded-md border-[#dfe2d6] text-[9px] font-normal text-[#899386] sm:inline-flex dark:border-white/10"
                    >
                      managed
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => deleteMutation.mutate({ id: file.id })}
                    className="h-8 w-8 rounded-lg p-0 text-[#9ba59a] hover:bg-[#ffe5ea] hover:text-[#d56e82]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-12 text-center">
              <FolderOpen className="mx-auto h-8 w-8 text-[#9ca69a]" />
              <p className="mt-3 text-sm font-medium">Папка пуста</p>
              <p className="mt-1 text-xs text-[#899386]">
                Добавь файл или папку, чтобы начать работу.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] dark:border-white/10 dark:bg-[#171f19]">
          <DialogHeader>
            <DialogTitle className="text-xl tracking-[-0.04em]">
              Новый элемент
            </DialogTitle>
            <DialogDescription className="text-sm text-[#74806f]">
              Путь: {parentPath}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={createFile} className="space-y-4 py-3">
            <div className="space-y-2">
              <Label className="text-[11px] text-[#687566]">Имя</Label>
              <Input
                autoFocus
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="например, whitelist.json"
                className="h-10 rounded-lg bg-[#f7f6ef] dark:bg-[#202a21]"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={kind === "file" ? "default" : "outline"}
                onClick={() => setKind("file")}
                className={cn(
                  "h-10 rounded-lg text-xs",
                  kind === "file"
                    ? "bg-[#151a16] text-white dark:bg-[#c5ff3f] dark:text-[#151a16]"
                    : "border-[#dfe2d6] dark:border-white/10"
                )}
              >
                <FileStack className="mr-1.5 h-3.5 w-3.5" /> Файл
              </Button>
              <Button
                type="button"
                variant={kind === "folder" ? "default" : "outline"}
                onClick={() => setKind("folder")}
                className={cn(
                  "h-10 rounded-lg text-xs",
                  kind === "folder"
                    ? "bg-[#151a16] text-white dark:bg-[#c5ff3f] dark:text-[#151a16]"
                    : "border-[#dfe2d6] dark:border-white/10"
                )}
              >
                <FolderOpen className="mr-1.5 h-3.5 w-3.5" /> Папка
              </Button>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="rounded-lg"
              >
                Отмена
              </Button>
              <Button
                type="submit"
                disabled={!name.trim() || createMutation.isPending}
                className="rounded-lg bg-[#151a16] text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16]"
              >
                {createMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}{" "}
                Сохранить
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CatalogView({
  activeServer,
  installed,
  onInstall,
  onFiles,
}: {
  activeServer?: Server;
  installed: {
    id: number;
    name: string;
    catalogType: string;
    version: string;
    status: string;
    createdAt: Date;
  }[];
  onInstall: (item: (typeof catalog)[number]) => void;
  onFiles: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = catalog.filter(item =>
    `${item.title} ${item.meta} ${item.type}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );
  const installedNames = new Set(installed.map(item => item.name));
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-5 rounded-[28px] bg-[#151c16] p-6 text-[#edf4e8] sm:p-8 lg:flex-row lg:items-end lg:p-10">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[#c5ff3f]">
            Install center
          </span>
          <h2 className="display-title mt-3 max-w-xl">
            Добавляй контент
            <br />
            <span className="text-[#c5ff3f]">без ручной рутины.</span>
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[#a7b3a5]">
            Сборки, плагины и карты проверяются на совместимость с твоей версией
            и устанавливаются в один клик.
          </p>
        </div>
        <Button
          onClick={onFiles}
          variant="outline"
          className="h-11 rounded-xl border-white/15 bg-transparent text-xs text-[#edf4e8] hover:bg-white/10 hover:text-white"
        >
          <FolderOpen className="mr-2 h-4 w-4" /> Файловый менеджер
        </Button>
      </section>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#8b9586]">
            Library / curated
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.05em]">
            Каталог
          </h2>
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#8b9586]" />
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Поиск расширений"
            className="h-9 rounded-lg border-[#dfe2d6] bg-[#fffdf7] pl-9 text-xs dark:border-white/10 dark:bg-[#171f19]"
          />
        </div>
      </div>
      {installed.length > 0 && (
        <Card className="rounded-[22px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
          <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
                  Install history
                </p>
                <CardTitle className="mt-1 text-lg tracking-[-0.04em]">
                  Установлено на {activeServer?.name}
                </CardTitle>
              </div>
              <PackageOpen className="h-5 w-5 text-[#789d34]" />
            </div>
          </CardHeader>
          <CardContent className="px-5 pb-5 sm:px-6">
            <div className="divide-y divide-[#e7e9df] dark:divide-white/10">
              {installed.map(item => (
                <div
                  key={item.id ?? `${item.name}-${item.version}`}
                  className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#edf6c9] text-[#71952a]">
                      <Check className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-xs font-medium">{item.name}</p>
                      <p className="mono mt-1 text-[10px] text-[#899386]">
                        {item.catalogType} · {item.version} ·{" "}
                        {formatTime(item.createdAt)}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant="outline"
                    className="w-fit rounded-md border-[#dfe2d6] text-[9px] font-normal text-[#789d34] dark:border-white/10"
                  >
                    {item.status === "queued" ? "В очереди" : item.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <div className="grid gap-5 md:grid-cols-3">
        {filtered.map(item => (
          <Card
            key={item.title}
            className="overflow-hidden rounded-[22px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]"
          >
            <div
              className={cn(
                "flex h-32 items-end bg-gradient-to-br p-5",
                item.color
              )}
            >
              <div className="rounded-lg bg-black/20 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur">
                {item.image}
              </div>
            </div>
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Badge
                    variant="outline"
                    className="rounded-md border-[#dfe2d6] text-[9px] font-normal text-[#7b8876] dark:border-white/10"
                  >
                    {item.type}
                  </Badge>
                  <h3 className="mt-3 text-lg font-semibold tracking-[-0.04em]">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-[11px] text-[#899386]">{item.meta}</p>
                </div>
                <span className="mono text-[10px] text-[#899386]">
                  {item.installs}
                </span>
              </div>
              <Button
                onClick={() => onInstall(item)}
                disabled={!activeServer || installedNames.has(item.title)}
                className="mt-5 h-9 w-full rounded-lg bg-[#151a16] text-[11px] text-white hover:bg-[#293529] disabled:opacity-60 dark:bg-[#c5ff3f] dark:text-[#151a16]"
              >
                {installedNames.has(item.title) ? (
                  <>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Установлено
                  </>
                ) : (
                  <>
                    <Plus className="mr-1.5 h-3.5 w-3.5" />{" "}
                    {activeServer ? "Установить" : "Выбери сервер"}
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BackupsView({
  server,
  backups,
  onAction,
  onCreate,
}: {
  server?: Server;
  backups: {
    id: number;
    name: string;
    sizeGb: number;
    status: string;
    artifactStatus: string;
    createdAt: Date;
  }[];
  onAction: (id: number, action: "restore" | "download") => void;
  onCreate: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="flex flex-col justify-between gap-4 rounded-[28px] bg-[#151c16] p-6 text-[#edf4e8] sm:flex-row sm:items-end sm:p-8">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.18em] text-[#c5ff3f]">
            Recovery center
          </span>
          <h2 className="display-title mt-3 max-w-xl">
            Миры под защитой,
            <br />
            <span className="text-[#c5ff3f]">даже когда ты спишь.</span>
          </h2>
          <p className="mt-5 max-w-lg text-sm leading-6 text-[#a7b3a5]">
            Сохраняй точки восстановления, скачивай их к себе и возвращайся к
            рабочей версии без стресса.
          </p>
        </div>
        <Button
          onClick={onCreate}
          className="h-11 rounded-xl bg-[#c5ff3f] text-xs font-semibold text-[#151a16] hover:bg-[#d8ff78]"
        >
          <Plus className="mr-2 h-4 w-4" /> Создать бэкап
        </Button>
      </section>
      <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
        <CardHeader className="px-5 pb-2 pt-5 sm:px-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="mono text-[10px] uppercase tracking-[0.16em] text-[#8b9586]">
                {server?.name || "Selected server"}
              </p>
              <CardTitle className="mt-1 text-xl tracking-[-0.04em]">
                История копий
              </CardTitle>
            </div>
            <ShieldCheck className="h-5 w-5 text-[#8ba8ff]" />
          </div>
        </CardHeader>
        <CardContent className="px-5 pb-5 sm:px-6">
          {backups.length ? (
            <div className="divide-y divide-[#e7e9df] dark:divide-white/10">
              {backups.map(backup => (
                <div
                  key={backup.id}
                  className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#e8edff] text-[#6d8de2]">
                      <FileArchive className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{backup.name}</p>
                      <p className="mono mt-1 text-[10px] text-[#899386]">
                        {formatTime(backup.createdAt)} · {backup.sizeGb} GB ·
                        сервер: {backup.status} · архив: {backup.artifactStatus}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      disabled={backup.status === "restoring"}
                      onClick={() => onAction(backup.id, "restore")}
                      className="h-8 rounded-lg border-[#dfe2d6] px-3 text-[10px] dark:border-white/10"
                    >
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Восстановить
                    </Button>
                    <Button
                      variant="outline"
                      disabled={backup.artifactStatus === "creating"}
                      onClick={() => onAction(backup.id, "download")}
                      className="h-8 rounded-lg border-[#dfe2d6] px-3 text-[10px] dark:border-white/10"
                    >
                      <Download className="mr-1.5 h-3.5 w-3.5" /> Скачать
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <CloudDownload className="mx-auto h-8 w-8 text-[#9ca69a]" />
              <p className="mt-3 text-sm font-medium">
                Пока нет резервных копий
              </p>
              <p className="mt-1 text-xs text-[#899386]">
                Создай первую точку восстановления для выбранного сервера.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
function SettingsView({ userName }: { userName: string }) {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#8b9586]">
          Workspace / preferences
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-[-0.06em]">
          Настройки пространства
        </h2>
      </div>
      <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
        <CardHeader>
          <CardTitle className="text-base">Профиль доступа</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-[#eff2e7] p-4 dark:bg-[#202a21]">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#c5ff3f] font-semibold text-[#151a16]">
              {userName.charAt(0) || "U"}
            </div>
            <div>
              <p className="text-sm font-medium">
                {userName || "Authenticated user"}
              </p>
              <p className="mt-1 text-[11px] text-[#899386]">
                Серверы видны только владельцу аккаунта
              </p>
            </div>
            <LockKeyhole className="ml-auto h-4 w-4 text-[#77906b]" />
          </div>
          <ToggleRow
            label="Уведомления о состоянии"
            description="Получать сигналы, если сервер остановился"
            checked
            onChange={() => toast.success("Настройка обновлена")}
          />
          <ToggleRow
            label="Автообновление метрик"
            description="Обновлять telemetry каждые 30 секунд"
            checked
            onChange={() => toast.success("Настройка обновлена")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
function HelpView() {
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <p className="mono text-[10px] uppercase tracking-[0.18em] text-[#8b9586]">
          Support / docs
        </p>
        <h2 className="mt-1 text-3xl font-semibold tracking-[-0.06em]">
          Центр помощи
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-[#778274]">
          Быстрые ответы по панели и понятные подсказки по запуску
          Minecraft-серверов.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <HelpCard
          icon={<LifeBuoy />}
          title="Как подключиться"
          text="Скопируй адрес сервера из карточки и добавь его в Minecraft."
        />
        <HelpCard
          icon={<FileStack />}
          title="Файлы и моды"
          text="Открой файловый менеджер, чтобы загрузить свои .jar, миры и конфиги."
        />
        <HelpCard
          icon={<ShieldCheck />}
          title="Доступ и безопасность"
          text="Все операции проходят через owner-scoped API и OAuth-сессию."
        />
        <HelpCard
          icon={<LayoutGrid />}
          title="Каталог"
          text="Устанавливай совместимые сборки, плагины и карты в один клик."
        />
      </div>
    </div>
  );
}
function HelpCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <Card className="rounded-[20px] border-[#dfe2d6] bg-[#fffdf7] p-5 panel-shadow dark:border-white/10 dark:bg-[#171f19]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#edf6c9] text-[#71952a]">
        {icon}
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-2 text-xs leading-5 text-[#899386]">{text}</p>
    </Card>
  );
}
function EmptyFleet({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-[24px] border border-dashed border-[#cbd3c1] bg-[#fffdf7]/70 px-6 py-14 text-center dark:border-white/15 dark:bg-[#171f19]/60">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#edf6c9] text-[#71952a]">
        <Server className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-semibold tracking-[-0.04em]">
        Начни с первого сервера
      </h3>
      <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-[#899386]">
        Создай рабочее пространство для выживания, мини-игр или тестовой сборки.
      </p>
      <Button
        onClick={onCreate}
        className="mt-5 h-10 rounded-lg bg-[#151a16] text-xs text-white hover:bg-[#293529] dark:bg-[#c5ff3f] dark:text-[#151a16]"
      >
        <Plus className="mr-1.5 h-4 w-4" /> Создать сервер
      </Button>
    </div>
  );
}
function QuickAddCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[325px] flex-col items-center justify-center rounded-[24px] border border-dashed border-[#cbd3c1] bg-[#fffdf7]/50 text-center transition-colors hover:border-[#98b26d] hover:bg-[#fbfcf3] dark:border-white/15 dark:bg-[#171f19]/40 dark:hover:bg-[#1b271d]"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#cbd3c1] text-[#829080] dark:border-white/15">
        <Plus className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium">Добавить сервер</p>
      <p className="mt-1 text-[11px] text-[#899386]">Java или Bedrock</p>
    </button>
  );
}
function LoadingFleet() {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {[1, 2, 3].map(item => (
        <div
          key={item}
          className="h-[325px] animate-pulse rounded-[24px] bg-[#e8eadf] dark:bg-[#1b241c]"
        />
      ))}
    </div>
  );
}
