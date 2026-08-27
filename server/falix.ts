const FALIX_BASE_URL = "https://client.falixnodes.net/api/v2";

import { createReadStream } from "node:fs";
import { Readable } from "node:stream";

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

function getFalixConfig(localServerId?: number) {
  const apiKey = process.env.FALIX_API_KEY;
  let serverId = Number(process.env.FALIX_SERVER_ID);
  try {
    const mapping = JSON.parse(process.env.FALIX_SERVER_MAP ?? "{}") as Record<string, number>;
    if (localServerId !== undefined && Number.isInteger(mapping[String(localServerId)])) serverId = Number(mapping[String(localServerId)]);
  } catch { /* use the single-server fallback */ }
  if (!apiKey || !Number.isInteger(serverId) || serverId <= 0) {
    throw new Error("Falix provider is not configured; set FALIX_API_KEY and FALIX_SERVER_ID");
  }
  return { apiKey, serverId };
}

async function falixRequest<T>(path: string, init: RequestInit = {}, localServerId?: number): Promise<T> {
  const { apiKey } = getFalixConfig(localServerId);
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

export async function falixGetServerDetails(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ allocation?: { ip?: string; port?: number; hostname?: string }; software?: { name?: string; version?: string } }>(`/servers/${serverId}`);
}

export async function falixGetStatus(localServerId?: number): Promise<FalixStatus> {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<FalixStatus>(`/servers/${serverId}/status`);
}

export async function falixSendPower(signal: FalixPowerSignal, localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ state?: string; message?: string }>(`/servers/${serverId}/power`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-${serverId}-${signal}-${Date.now()}` },
    body: JSON.stringify({ signal }),
  });
}

export async function falixGetMonitor(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/monitor/data?range=15m&view=metrics`);
}

export async function falixGetOnlinePlayers(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
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

export async function falixListFiles(path = "/", localServerId?: number): Promise<FalixFile[]> {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<FalixFile[]>(`/servers/${serverId}/files?path=${encodeURIComponent(path)}`);
}

export async function falixWriteFile(path: string, content = "", localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/files/content`, {
    method: "PUT",
    headers: { "Idempotency-Key": `craftpanel-write-${serverId}-${Date.now()}` },
    body: JSON.stringify({ path, content }),
  });
}

export async function falixCreateFolder(parentPath: string, name: string, localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/files/folder`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-folder-${serverId}-${Date.now()}` },
    body: JSON.stringify({ path: parentPath, name }),
  });
}

export async function falixDeleteFiles(paths: string[], localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/files/delete`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-delete-${serverId}-${Date.now()}` },
    body: JSON.stringify({ paths }),
  });
}

export async function falixReadFile(path: string, localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/files/content?path=${encodeURIComponent(path)}`);
}

export async function falixCreateUpload(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ url?: string; expires_at?: string }>(`/servers/${serverId}/files/upload`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-upload-${serverId}-${Date.now()}` },
  }, localServerId);
}

export async function falixUploadFile(directory: string, filename: string, bytes: Uint8Array, mimeType: string, localServerId?: number) {
  const signed = await falixCreateUpload(localServerId);
  if (!signed.url) throw new Error("Falix did not return an upload URL");
  const uploadUrl = new URL(signed.url);
  uploadUrl.searchParams.set("directory", directory);
  const form = new FormData();
  const fileBytes = new Uint8Array(bytes);
  form.append("file", new Blob([fileBytes.buffer as ArrayBuffer], { type: mimeType }), filename);
  const response = await fetch(uploadUrl, { method: "POST", body: form });
  if (!response.ok) throw new Error(`Falix upload failed (${response.status})`);
  return { success: true, expiresAt: signed.expires_at };
}

export async function falixUploadFileFromPath(directory: string, filename: string, filePath: string, fileSize: number, mimeType: string, localServerId?: number) {
  const signed = await falixCreateUpload(localServerId);
  if (!signed.url) throw new Error("Falix did not return an upload URL");
  const uploadUrl = new URL(signed.url);
  uploadUrl.searchParams.set("directory", directory);
  const boundary = `----craftpanel-${Date.now().toString(16)}`;
  const preamble = Buffer.from(`--${boundary}\\r\\nContent-Disposition: form-data; name="file"; filename="${filename.replace(/["\\\\\\r\\n]/g, "_")}"\\r\\nContent-Type: ${mimeType}\\r\\n\\r\\n`);
  const ending = Buffer.from(`\\r\\n--${boundary}--\\r\\n`);
  const body = Readable.from((async function* () {
    yield preamble;
    for await (const chunk of createReadStream(filePath)) yield chunk;
    yield ending;
  })());
  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
      "Content-Length": String(preamble.length + fileSize + ending.length),
    },
    body: body as unknown as BodyInit,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
  if (!response.ok) throw new Error(`Falix upload failed (${response.status})`);
  return { success: true, expiresAt: signed.expires_at };
}

export async function falixCreateDownload(path: string, localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ url?: string; expires_at?: string }>(`/servers/${serverId}/files/download`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-download-${serverId}-${Date.now()}` },
    body: JSON.stringify({ path }),
  });
}

export async function falixCreateWebhook(url: string, events: string[], localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ id: string; secret: string; enabled?: boolean }>(`/servers/${serverId}/hooks`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-hook-${serverId}-${Date.now()}` },
    body: JSON.stringify({ url, events }),
  }, localServerId);
}

export async function falixListWebhooks(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown[]>(`/servers/${serverId}/hooks`, {}, localServerId);
}

export async function falixUpdateWebhook(hookId: string, patch: { url?: string; events?: string[]; enabled?: boolean }, localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<unknown>(`/servers/${serverId}/hooks/${encodeURIComponent(hookId)}`, {
    method: "PATCH",
    headers: { "Idempotency-Key": `craftpanel-hook-update-${serverId}-${hookId}-${Date.now()}` },
    body: JSON.stringify(patch),
  }, localServerId);
}

export async function falixCreateConsoleSession(localServerId?: number) {
  const { serverId } = getFalixConfig(localServerId);
  return falixRequest<{ socket: string; token: string; permissions?: string[] }>(`/servers/${serverId}/console/token`, {
    method: "POST",
    headers: { "Idempotency-Key": `craftpanel-console-${serverId}-${Date.now()}` },
  });
}

export async function falixSendConsoleCommand(command: string, localServerId?: number): Promise<{ output: string[]; status?: string }> {
  const session = await falixCreateConsoleSession(localServerId);
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
  return Boolean(process.env.FALIX_API_KEY && (Number(process.env.FALIX_SERVER_ID) > 0 || process.env.FALIX_SERVER_MAP));
}
