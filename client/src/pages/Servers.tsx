import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { filterAndSortServers, type ServerListFilters } from "@/lib/serverFilters";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Activity,
  ChevronRight,
  Cpu,
  FolderOpen,
  Gamepad2,
  HardDrive,
  MemoryStick,
  Play,
  RefreshCw,
  Search,
  Server as ServerIcon,
  SlidersHorizontal,
  Square,
  Users,
  Wifi,
} from "lucide-react";

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
};

const statusLabel: Record<Server["status"], string> = {
  online: "Онлайн",
  offline: "Офлайн",
  starting: "Запускается",
  stopping: "Останавливается",
};

const statusClass: Record<Server["status"], string> = {
  online: "bg-[#effbd6] text-[#638823] dark:bg-[#293b22] dark:text-[#c5ff3f]",
  offline: "bg-[#f1f3ea] text-[#899386] dark:bg-[#202a21] dark:text-[#aab8a4]",
  starting: "bg-[#fff4d8] text-[#9e741d] dark:bg-[#3d321c] dark:text-[#ffd36b]",
  stopping: "bg-[#ffe5e8] text-[#ad4c5a] dark:bg-[#3b2226] dark:text-[#ff9daa]",
};

const formatMemory = (mb: number) =>
  mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;

const percent = (value: number, total: number) =>
  total ? Math.min(100, Math.round((value / total) * 100)) : 0;

function MetricBar({ label, value, tone }: { label: string; value: number; tone: "lime" | "blue" | "orange" }) {
  const toneClass = {
    lime: "bg-[#c5ff3f]",
    blue: "bg-[#7ea7ff]",
    orange: "bg-[#ffb45f]",
  }[tone];
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[10px] text-[#899386]">
        <span>{label}</span>
        <span className="mono text-[10px] text-[#637061] dark:text-[#b1beb0]">{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-[#e7e9df] dark:bg-[#263127]">
        <div className={cn("h-full rounded-full transition-[width] duration-300", toneClass)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function Servers() {
  const [, setLocation] = useLocation();
  const [filters, setFilters] = useState<ServerListFilters>({
    query: "",
    status: "all",
    serverType: "all",
    sort: "status",
  });
  const serversQuery = trpc.servers.list.useQuery(undefined, {
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const utils = trpc.useUtils();
  const actionMutation = trpc.servers.action.useMutation({
    onSuccess: async (_result, input) => {
      await utils.servers.list.invalidate();
      const actionLabel = input.action === "start" ? "запущен" : input.action === "stop" ? "остановлен" : "перезапущен";
      toast.success(`Сервер ${actionLabel}`);
    },
    onError: error => toast.error(error.message || "Не удалось выполнить действие"),
  });
  const servers = (serversQuery.data ?? []) as Server[];
  const filteredServers = useMemo(() => filterAndSortServers(servers, filters), [servers, filters]);
  const onlineCount = servers.filter(server => server.status === "online").length;

  const updateFilter = <K extends keyof ServerListFilters>(key: K, value: ServerListFilters[K]) =>
    setFilters(current => ({ ...current, [key]: value }));

  return (
    <div className="soft-grid min-h-screen bg-[#f4f1e8] px-4 py-6 dark:bg-[#111713] sm:px-6 lg:px-10 lg:py-9">
      <div className="mx-auto max-w-[1440px] space-y-7">
        <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <p className="mono mb-2 text-[10px] uppercase tracking-[0.18em] text-[#8b9586]">Workspace / server fleet</p>
            <h1 className="display-title text-3xl tracking-[-0.06em] sm:text-4xl">Панель серверов</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#788374] dark:text-[#a4b0a1]">Управляй всеми мирами из одного списка: состояние, ресурсы, адрес подключения и быстрые действия всегда перед глазами.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="rounded-xl border border-[#dfe2d6] bg-[#fffdf7] px-3 py-2 text-xs dark:border-white/10 dark:bg-[#171f19]"><span className="status-dot online mr-2 inline-block" />{onlineCount} онлайн</div>
            <Button variant="outline" onClick={() => void serversQuery.refetch()} disabled={serversQuery.isFetching} className="h-10 rounded-xl border-[#dfe2d6] bg-[#fffdf7] text-xs dark:border-white/10 dark:bg-[#171f19]"><RefreshCw className={cn("mr-2 h-3.5 w-3.5", serversQuery.isFetching && "animate-spin")} />Обновить</Button>
          </div>
        </section>

        <Card className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow dark:border-white/10 dark:bg-[#171f19]">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center gap-2 text-xs font-medium"><SlidersHorizontal className="h-4 w-4 text-[#799d32]" />Фильтры серверов</div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(150px,1fr))]">
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#899386]" /><Input value={filters.query} onChange={event => updateFilter("query", event.target.value)} placeholder="Поиск по названию сервера" aria-label="Поиск по названию сервера" className="h-10 rounded-xl border-[#dfe2d6] bg-[#f7f6ef] pl-9 text-xs dark:border-white/10 dark:bg-[#202a21]" /></div>
              <select value={filters.status} onChange={event => updateFilter("status", event.target.value as ServerListFilters["status"])} aria-label="Фильтр по статусу" className="h-10 rounded-xl border border-[#dfe2d6] bg-[#f7f6ef] px-3 text-xs text-[#637061] outline-none focus:ring-2 focus:ring-[#c5ff3f] dark:border-white/10 dark:bg-[#202a21] dark:text-[#dce6d8]"><option value="all">Все статусы</option><option value="online">Онлайн</option><option value="starting">Запускаются</option><option value="stopping">Останавливаются</option><option value="offline">Офлайн</option></select>
              <select value={filters.serverType} onChange={event => updateFilter("serverType", event.target.value as ServerListFilters["serverType"])} aria-label="Фильтр по типу" className="h-10 rounded-xl border border-[#dfe2d6] bg-[#f7f6ef] px-3 text-xs text-[#637061] outline-none focus:ring-2 focus:ring-[#c5ff3f] dark:border-white/10 dark:bg-[#202a21] dark:text-[#dce6d8]"><option value="all">Java и Bedrock</option><option value="java">Только Java</option><option value="bedrock">Только Bedrock</option></select>
              <select value={filters.sort} onChange={event => updateFilter("sort", event.target.value as ServerListFilters["sort"])} aria-label="Сортировка серверов" className="h-10 rounded-xl border border-[#dfe2d6] bg-[#f7f6ef] px-3 text-xs text-[#637061] outline-none focus:ring-2 focus:ring-[#c5ff3f] dark:border-white/10 dark:bg-[#202a21] dark:text-[#dce6d8]"><option value="status">Сначала активные</option><option value="name">По названию</option><option value="players">По игрокам</option><option value="ram">По RAM</option></select>
            </div>
            <div className="mt-3 flex items-center justify-between text-[11px] text-[#899386]"><span>Показано {filteredServers.length} из {servers.length}</span>{(filters.query || filters.status !== "all" || filters.serverType !== "all") && <button onClick={() => setFilters(current => ({ ...current, query: "", status: "all", serverType: "all" }))} className="font-medium text-[#6f922d] hover:underline">Сбросить фильтры</button>}</div>
          </CardContent>
        </Card>

        {serversQuery.isLoading ? <div className="grid gap-5 xl:grid-cols-2"><div className="h-80 animate-pulse rounded-[24px] bg-[#e8e8dc] dark:bg-[#1b251d]" /><div className="h-80 animate-pulse rounded-[24px] bg-[#e8e8dc] dark:bg-[#1b251d]" /></div> : filteredServers.length === 0 ? <Card className="rounded-[24px] border-dashed border-[#cfd5c6] bg-[#fffdf7] dark:border-white/10 dark:bg-[#171f19]"><CardContent className="flex flex-col items-center justify-center px-6 py-16 text-center"><ServerIcon className="h-9 w-9 text-[#9baa95]" /><h2 className="mt-4 text-lg font-semibold">Серверы не найдены</h2><p className="mt-2 max-w-sm text-sm text-[#899386]">Измени фильтры или создай новый сервер, чтобы он появился в рабочем списке.</p><Button onClick={() => setLocation("/")} className="mt-5 rounded-xl bg-[#c5ff3f] text-[#151a16] hover:bg-[#d7ff76]">Вернуться к обзору <ChevronRight className="ml-2 h-4 w-4" /></Button></CardContent></Card> : <div className="grid gap-5 xl:grid-cols-2">{filteredServers.map(server => {
          const ramPercent = percent(server.ramUsedMb, server.ramTotalMb);
          const diskPercent = percent(server.diskUsedGb, server.diskTotalGb);
          const isBusy = actionMutation.isPending && actionMutation.variables?.id === server.id;
          return <Card key={server.id} className="rounded-[24px] border-[#dfe2d6] bg-[#fffdf7] panel-shadow transition-transform hover:-translate-y-0.5 dark:border-white/10 dark:bg-[#171f19]">
            <CardHeader className="space-y-4 px-5 pb-4 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-4"><div className="flex min-w-0 items-center gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#effbd6] text-[#6c9626] dark:bg-[#293b22] dark:text-[#c5ff3f]"><Gamepad2 className="h-5 w-5" /></div><div className="min-w-0"><CardTitle className="truncate text-lg tracking-[-0.04em]">{server.name}</CardTitle><p className="mt-1 truncate text-xs text-[#899386]">{server.motd || `${server.serverType === "java" ? "Java Edition" : "Bedrock Edition"} · ${server.core} ${server.version}`}</p></div></div><Badge className={cn("shrink-0 rounded-md text-[10px]", statusClass[server.status])}><span className={cn("status-dot mr-1.5 inline-block", server.status === "online" ? "online" : "bg-[#9aa597]")} />{statusLabel[server.status]}</Badge></div>
              <div className="flex items-center justify-between gap-3 rounded-xl bg-[#f1f3ea] px-3 py-2.5 dark:bg-[#202a21]"><div className="flex min-w-0 items-center gap-2"><Wifi className="h-3.5 w-3.5 shrink-0 text-[#799d32]" /><span className="mono truncate text-[10px] text-[#637061] dark:text-[#b1beb0]">{server.address || "Адрес появится после запуска"}</span></div><button onClick={() => setLocation("/")} className="shrink-0 text-[10px] font-medium text-[#6f922d] hover:underline">Открыть обзор</button></div>
            </CardHeader>
            <CardContent className="space-y-5 px-5 pb-5 sm:px-6 sm:pb-6">
              <div className="grid grid-cols-3 gap-3"><div><p className="mb-1 flex items-center gap-1.5 text-[10px] text-[#899386]"><Users className="h-3 w-3" />Игроки</p><p className="text-sm font-semibold">{server.playersOnline} <span className="font-normal text-[#899386]">/ {server.maxPlayers}</span></p></div><div><p className="mb-1 flex items-center gap-1.5 text-[10px] text-[#899386]"><Activity className="h-3 w-3" />TPS</p><p className="text-sm font-semibold">{server.tps || "—"} <span className="font-normal text-[#899386]">/ 20</span></p></div><div><p className="mb-1 flex items-center gap-1.5 text-[10px] text-[#899386]"><Cpu className="h-3 w-3" />CPU</p><p className="text-sm font-semibold">{server.cpuPercent}%</p></div></div>
              <div className="space-y-3"><MetricBar label="Оперативная память" value={ramPercent} tone="blue" /><MetricBar label="Диск" value={diskPercent} tone="orange" /></div>
              <Separator />
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[11px] text-[#899386]"><MemoryStick className="h-3.5 w-3.5" />{formatMemory(server.ramUsedMb)} / {formatMemory(server.ramTotalMb)}<HardDrive className="ml-2 h-3.5 w-3.5" />{server.diskUsedGb} / {server.diskTotalGb} GB</div><span className="text-[10px] text-[#899386]">{server.serverType === "java" ? "Java" : "Bedrock"} · {server.core} {server.version}</span></div>
              <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => actionMutation.mutate({ id: server.id, action: "start" })} disabled={isBusy || server.status === "online" || server.status === "starting"} className="h-9 rounded-lg bg-[#151a16] text-[11px] text-white hover:bg-[#2c382d] dark:bg-[#c5ff3f] dark:text-[#151a16] dark:hover:bg-[#d7ff76]"><Play className="mr-1.5 h-3.5 w-3.5" />Запустить</Button><Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: server.id, action: "stop" })} disabled={isBusy || server.status === "offline" || server.status === "stopping"} className="h-9 rounded-lg border-[#dfe2d6] text-[11px] dark:border-white/10"><Square className="mr-1.5 h-3.5 w-3.5" />Остановить</Button><Button size="sm" variant="outline" onClick={() => actionMutation.mutate({ id: server.id, action: "restart" })} disabled={isBusy} className="h-9 rounded-lg border-[#dfe2d6] text-[11px] dark:border-white/10"><RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", isBusy && "animate-spin")} />Перезапустить</Button><Button size="sm" variant="outline" onClick={() => setLocation("/files")} className="h-9 rounded-lg border-[#dfe2d6] text-[11px] dark:border-white/10"><FolderOpen className="mr-1.5 h-3.5 w-3.5" />Файлы</Button></div>
            </CardContent>
          </Card>;
        })}</div>}
      </div>
    </div>
  );
}
