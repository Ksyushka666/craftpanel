const FALIX_BASE_URL = "https://client.falixnodes.net/api/v2";

export type FalixPowerSignal = "start" | "stop" | "restart" | "kill";
export type FalixStatus = {
  state?: "offline" | "starting" | "running" | "stopping";
  node_ready?: boolean;
  resources?: {
    cpu_percent?: number;
    memory_bytes?: number;
    memory_limit_bytes?: number;
    disk_bytes?: number;
    uptime_seconds?: number;
  };
};

function getFalixConfig() {
  const apiKey = process.env.FALIX_API_KEY;
  const serverId = Number(process.env.FALIX_SERVER_ID);
  if (!apiKey || !Number.isInteger(serverId) || serverId <= 0) {
    throw new Error("Falix provider is not configured; set FALIX_API_KEY and FALIX_SERVER_ID");
  }
  return { apiKey, serverId };
}

async function falixRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { apiKey } = getFalixConfig();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${FALIX_BASE_URL}${path}`, { ...init, headers });
  const raw = await response.text();
  let payload: unknown = undefined;
  try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = raw; }
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string; action_url?: string } } | undefined;
    const suffix = error?.error?.action_url ? ` Action required: ${error.error.action_url}` : "";
    throw new Error(`Falix API ${response.status}: ${error?.error?.message ?? "request failed"}${suffix}`);
  }
  return (payload as { data?: T })?.data as T;
}

export async function falixGetServerDetails() {
  const { serverId } = getFalixConfig();
  return falixRequest<{ allocation?: { ip?: string; port?: number; hostname?: string }; software?: { name?: string; version?: string } }>(`/servers/${serverId}`);
}

export async function falixGetStatus(): Promise<FalixStatus> {
  const { serverId } = getFalixConfig();
  return falixRequest<FalixStatus>(`/servers/${serverId}/status`);
}

export async function falixSendPower(signal: FalixPowerSignal) {
  const { serverId } = getFalixConfig();
  return falixRequest<{ state?: string; message?: string }>(`/servers/${serverId}/power`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-${serverId}-${signal}-${Date.now()}` },
    body: JSON.stringify({ signal }),
  });
}

export async function falixGetMonitor() {
  const { serverId } = getFalixConfig();
  return falixRequest<unknown>(`/servers/${serverId}/monitor/data?range=15m&view=metrics`);
}

export async function falixGetOnlinePlayers() {
  const { serverId } = getFalixConfig();
  return falixRequest<{ online_players?: number; player_names?: string[] }>(`/servers/${serverId}/players/online`);
}

export type FalixFile = {
  name: string;
  path: string;
  is_file: boolean;
  is_directory: boolean;
  size: number;
  modified_at: string;
};

export async function falixListFiles(path = "/"): Promise<FalixFile[]> {
  const { serverId } = getFalixConfig();
  return falixRequest<FalixFile[]>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
}

export async function falixWriteFile(path: string, content = "") {
  const { serverId } = getFalixConfig();
  return falixRequest<unknown>(`/servers/${serverId}/files/content`, {
    method: "PUT",
    headers: { "Idempotency-Key": `craftpanel-write-${serverId}-${Date.now()}` },
    body: JSON.stringify({ path, content }),
  });
}

export async function falixCreateFolder(parentPath: string, name: string) {
  const { serverId } = getFalixConfig();
  return falixRequest<unknown>(`/servers/${serverId}/files/folder`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-folder-${serverId}-${Date.now()}` },
    body: JSON.stringify({ path: parentPath, name }),
  });
}

export async function falixDeleteFiles(paths: string[]) {
  const { serverId } = getFalixConfig();
  return falixRequest<unknown>(`/servers/${serverId}/files/delete`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-delete-${serverId}-${Date.now()}` },
    body: JSON.stringify({ paths }),
  });
}

export async function falixReadFile(path: string) {
  const { serverId } = getFalixConfig();
  return falixRequest<unknown>(`/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`);
}

export async function falixCreateConsoleSession() {
  const { serverId } = getFalixConfig();
  return falixRequest<{ socket: string; token: string; permissions?: string[] }>(`/servers/${serverId}/console/token`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-console-${serverId}-${Date.now()}` },
  });
}

export async function falixSendConsoleCommand(command: string): Promise<{ output: string[]; status?: string }> {
  const session = await falixCreateConsoleSession();
  const WebSocketImpl = (globalThis as typeof globalThis & { WebSocket?: new (url: string) => any }).WebSocket;
  if (!WebSocketImpl) throw new Error("WebSocket runtime is unavailable");
  const socket = new WebSocketImpl(session.socket);
  const output: string[] = [];
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { socket.close(); resolve({ output }); }, 8_000);
    socket.onopen = () => socket.send(JSON.stringify({ event: "auth", args: [session.token] }));
    socket.onerror = () => { clearTimeout(timeout); reject(new Error("Falix console WebSocket failed")); };
    socket.onmessage = (event: { data: string }) => {
      let frame: { event?: string; args?: string[] };
      try { frame = JSON.parse(event.data); } catch { return; }
      if (frame.event === "auth success") {
        socket.send(JSON.stringify({ event: "send command", args: [command] }));
        socket.send(JSON.stringify({ event: "send stats", args: [] }));
      } else if (frame.event === "console output" && frame.args?.[0]) {
        output.push(frame.args[0]);
        if (output.length >= 1) { clearTimeout(timeout); socket.close(); resolve({ output }); }
      } else if (frame.event === "status" && frame.args?.[0]) {
        if (frame.args[0] === "offline" || frame.args[0] === "running" || frame.args[0] === "starting" || frame.args[0] === "stopping") {
          // status is returned alongside command acknowledgement and is safe to surface.
        }
      } else if (frame.event === "jwt error") {
        clearTimeout(timeout); socket.close(); reject(new Error("Falix console session expired or was rejected"));
      }
    };
  });
}

export function falixIsConfigured() {
  return Boolean(process.env.FALIX_API_KEY && Number(process.env.FALIX_SERVER_ID) > 0);
}
