import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const dbMocks = vi.hoisted(() => ({
  getOwnedServers: vi.fn(),
  getOwnedServer: vi.fn(),
  updateOwnedServerStatus: vi.fn(),
  logServerAction: vi.fn(),
  updateOwnedServerConfig: vi.fn(),
  getRecentServerActions: vi.fn(),
  getOwnedBackups: vi.fn(),
  getOwnedBackup: vi.fn(),
  createOwnedBackup: vi.fn(),
  createOwnedServer: vi.fn(),
  createOrGetBackupArtifact: vi.fn(),
  requestOwnedBackupRestore: vi.fn(),
  updateBackupFromRuntime: vi.fn(),
  setOwnedBackupArtifactStatus: vi.fn(),
  setOwnedBackupStatus: vi.fn(),
  getOwnedInstallations: vi.fn(),
  createOwnedInstallation: vi.fn(),
  getOwnedFiles: vi.fn(),
  createOwnedFile: vi.fn(),
  deleteOwnedFile: vi.fn(),
}));

vi.mock("./db", () => dbMocks);

import { appRouter } from "./routers";

const sampleServer = {
  id: 7,
  ownerId: 42,
  name: "Luna SMP",
  slug: "luna-smp",
  serverType: "java" as const,
  core: "Paper",
  version: "1.21.1",
  status: "online" as const,
  maxPlayers: 20,
  playersOnline: 4,
  tps: 20,
  ramUsedMb: 2048,
  ramTotalMb: 4096,
  cpuPercent: 32,
  diskUsedGb: 10,
  diskTotalGb: 40,
  address: "luna.play.craftpanel.local",
  motd: "Luna SMP",
  pvp: 1,
  onlineMode: 1,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function createContext(userId = 42): TrpcContext {
  return {
    user: { id: userId, openId: `user-${userId}`, email: "user@example.com", name: "Test User", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("servers ownership and actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMocks.getOwnedServer.mockResolvedValue(sampleServer);
    dbMocks.getOwnedBackup.mockResolvedValue({ id: 9, serverId: 7, ownerId: 42, name: "Luna SMP", sizeGb: 2, status: "ready", artifactKey: null, createdAt: new Date() });
    dbMocks.updateOwnedServerStatus.mockResolvedValue(sampleServer);
    dbMocks.logServerAction.mockResolvedValue([]);
  });

  it("rejects an action when the server is not owned by the current user", async () => {
    dbMocks.getOwnedServer.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext(99));
    await expect(caller.servers.action({ id: 7, action: "start" })).rejects.toThrow("Server not found");
    expect(dbMocks.updateOwnedServerStatus).not.toHaveBeenCalled();
    expect(dbMocks.logServerAction).not.toHaveBeenCalled();
  });

  it("updates and logs an action only after the owner check passes", async () => {
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.action({ id: 7, action: "restart" });
    expect(result.success).toBe(true);
    expect(dbMocks.updateOwnedServerStatus).toHaveBeenCalledWith(42, 7, "online");
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(42, 7, "restart", undefined, expect.stringContaining("RESTART"));
  });

  it("passes the authenticated owner id to the server list query", async () => {
    dbMocks.getOwnedServers.mockResolvedValue([sampleServer]);
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.list();
    expect(dbMocks.getOwnedServers).toHaveBeenCalledWith(42);
  });

  it("persists a catalog installation only for an owned server", async () => {
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.catalog.install({ serverId: 7, catalogType: "plugin", name: "EssentialsX", version: "2.20.1" });
    expect(dbMocks.createOwnedInstallation).toHaveBeenCalledWith(42, 7, { catalogType: "plugin", name: "EssentialsX", version: "2.20.1" });
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(42, 7, "catalog_install", "EssentialsX", "Installed EssentialsX");
  });

  it("keeps file listing owner-scoped", async () => {
    const caller = appRouter.createCaller(createContext(42));
    dbMocks.getOwnedFiles.mockResolvedValue([]);
    await caller.servers.files.list({ serverId: 7, parentPath: "/plugins" });
    expect(dbMocks.getOwnedFiles).toHaveBeenCalledWith(42, 7, "/plugins");
  });

  it("rejects a runtime callback without the adapter token", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    const caller = appRouter.createCaller(createContext(42));
    await expect(caller.runtime.backupCallback({ backupId: 9, status: "failed", artifactStatus: "failed" })).rejects.toThrow("Unauthorized runtime callback");
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("accepts an authenticated runtime completion callback", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    dbMocks.updateBackupFromRuntime.mockResolvedValue({ id: 9, status: "ready", artifactStatus: "ready" });
    const ctx = createContext(42);
    ctx.req.headers = { "x-craftpanel-runtime-token": "runtime-secret" } as typeof ctx.req.headers;
    const caller = appRouter.createCaller(ctx);
    const result = await caller.runtime.backupCallback({ backupId: 9, status: "ready", artifactStatus: "ready", artifactKey: "node/backup-9.tar.gz", sizeGb: 3 });
    expect(dbMocks.updateBackupFromRuntime).toHaveBeenCalledWith(9, { backupId: 9, status: "ready", artifactStatus: "ready", artifactKey: "node/backup-9.tar.gz", sizeGb: 3 });
    expect(result).toMatchObject({ status: "ready", artifactStatus: "ready" });
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("keeps restore status from the runtime adapter", async () => {
    dbMocks.requestOwnedBackupRestore.mockResolvedValue({ status: "restoring", output: "Restore queued on game node" });
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.backupAction({ id: 9, action: "restore" });
    expect(result.status).toBe("restoring");
    expect(result.output).toBe("Restore queued on game node");
  });

  it("marks artifact generation ready after a successful download", async () => {
    dbMocks.createOrGetBackupArtifact.mockResolvedValue({ key: "42-backups/7/backup.json", url: "/manus-storage/42-backups/7/backup.json" });
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.backupAction({ id: 9, action: "download" });
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(1, 42, 9, "creating");
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(2, 42, 9, "ready");
  });

  it("marks artifact generation failed when the runtime rejects an archive", async () => {
    dbMocks.createOrGetBackupArtifact.mockRejectedValue(new Error("Runtime unavailable"));
    const caller = appRouter.createCaller(createContext(42));
    await expect(caller.servers.backupAction({ id: 9, action: "download" })).rejects.toThrow("Runtime unavailable");
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(1, 42, 9, "creating");
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(2, 42, 9, "failed");
  });

  it("returns an artifact URL for an owned backup download", async () => {
    dbMocks.createOrGetBackupArtifact.mockResolvedValue({ key: "42-backups/7/backup.json", url: "/manus-storage/42-backups/7/backup.json" });
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.backupAction({ id: 9, action: "download" });
    expect(result.downloadReady).toBe(true);
    expect(result.downloadUrl).toBe("/manus-storage/42-backups/7/backup.json");
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(42, 7, "backup_download", "Luna SMP", "Secure download ready for Luna SMP");
  });
});
