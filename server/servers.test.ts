import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const falixMocks = vi.hoisted(() => ({
  falixCreateFolder: vi.fn(),
  falixGetOnlinePlayers: vi.fn(),
  falixGetServerDetails: vi.fn(),
  falixGetStatus: vi.fn(),
  falixIsConfigured: vi.fn(() => false),
  falixListFiles: vi.fn(),
  falixReadFile: vi.fn(),
  falixWriteFile: vi.fn(),
  falixDeleteFiles: vi.fn(),
  falixSendConsoleCommand: vi.fn(),
  falixSendPower: vi.fn(),
}));

vi.mock("./falix", () => falixMocks);

const dbMocks = vi.hoisted(() => ({
  getOwnedServers: vi.fn(),
  getOwnedServer: vi.fn(),
  updateOwnedServerStatus: vi.fn(),
  updateOwnedServerTelemetry: vi.fn(),
  logServerAction: vi.fn(),
  updateOwnedServerConfig: vi.fn(),
  getRecentServerActions: vi.fn(),
  getRecentServerLogs: vi.fn(),
  createServerLog: vi.fn(),
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
    user: {
      id: userId,
      openId: `user-${userId}`,
      email: "user@example.com",
      name: "Test User",
      loginMethod: "test",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("servers ownership and actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    falixMocks.falixIsConfigured.mockReturnValue(false);
    falixMocks.falixGetServerDetails.mockResolvedValue({});
    falixMocks.falixGetStatus.mockResolvedValue({ state: "offline", resources: {} });
    falixMocks.falixGetOnlinePlayers.mockResolvedValue({ online_players: 0 });
    dbMocks.getOwnedServer.mockResolvedValue(sampleServer);
    dbMocks.getOwnedBackup.mockResolvedValue({
      id: 9,
      serverId: 7,
      ownerId: 42,
      name: "Luna SMP",
      sizeGb: 2,
      status: "ready",
      artifactKey: null,
      createdAt: new Date(),
    });
    dbMocks.updateOwnedServerStatus.mockResolvedValue(sampleServer);
    dbMocks.updateOwnedServerTelemetry.mockResolvedValue(sampleServer);
    dbMocks.logServerAction.mockResolvedValue([]);
  });

  it("rejects an action when the server is not owned by the current user", async () => {
    dbMocks.getOwnedServer.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createContext(99));
    await expect(
      caller.servers.action({ id: 7, action: "start" })
    ).rejects.toThrow("Server not found");
    expect(dbMocks.updateOwnedServerStatus).not.toHaveBeenCalled();
    expect(dbMocks.logServerAction).not.toHaveBeenCalled();
  });

  it("updates and logs an action only after the owner check passes", async () => {
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.action({ id: 7, action: "restart" });
    expect(result.success).toBe(true);
    expect(dbMocks.updateOwnedServerStatus).toHaveBeenCalledWith(
      42,
      7,
      "starting"
    );
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(
      42,
      7,
      "restart",
      undefined,
      expect.stringContaining("RESTART")
    );
  });

  it("delegates lifecycle actions to Falix when the provider is configured", async () => {
    falixMocks.falixIsConfigured.mockReturnValue(true);
    falixMocks.falixSendPower.mockResolvedValue({ state: "starting" });
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.action({ id: 7, action: "start" });
    expect(result.success).toBe(true);
    expect(falixMocks.falixSendPower).toHaveBeenCalledWith("start");
    expect(dbMocks.updateOwnedServerStatus).not.toHaveBeenCalled();
  });

  it("persists Falix telemetry during the server list sync", async () => {
    falixMocks.falixIsConfigured.mockReturnValue(true);
    falixMocks.falixGetServerDetails.mockResolvedValue({ allocation: { ip: "5.9.89.83", port: 32296 } });
    falixMocks.falixGetStatus.mockResolvedValue({ state: "running", resources: { cpu_percent: 18, memory_bytes: 512 * 1024 * 1024, memory_limit_bytes: 2560 * 1024 * 1024, disk_bytes: 1024 * 1024 * 1024 } });
    falixMocks.falixGetOnlinePlayers.mockResolvedValue({ online_players: 3 });
    dbMocks.getOwnedServers.mockResolvedValue([sampleServer]);
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.list();
    expect(dbMocks.updateOwnedServerTelemetry).toHaveBeenCalledWith(42, 7, expect.objectContaining({
      status: "online",
      playersOnline: 3,
      cpuPercent: 18,
      ramUsedMb: 512,
      ramTotalMb: 2560,
      address: "5.9.89.83:32296",
    }));
  });

  it("passes the authenticated owner id to the server list query", async () => {
    dbMocks.getOwnedServers.mockResolvedValue([sampleServer]);
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.list();
    expect(dbMocks.getOwnedServers).toHaveBeenCalledWith(42);
  });

  it("persists a catalog installation only for an owned server", async () => {
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.catalog.install({
      serverId: 7,
      catalogType: "plugin",
      name: "EssentialsX",
      version: "2.20.1",
    });
    expect(dbMocks.createOwnedInstallation).toHaveBeenCalledWith(42, 7, {
      catalogType: "plugin",
      name: "EssentialsX",
      version: "2.20.1",
    });
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(
      42,
      7,
      "catalog_install",
      "EssentialsX",
      "Installed EssentialsX"
    );
  });

  it("keeps file listing owner-scoped", async () => {
    const caller = appRouter.createCaller(createContext(42));
    dbMocks.getOwnedFiles.mockResolvedValue([]);
    await caller.servers.files.list({ serverId: 7, parentPath: "/plugins" });
    expect(dbMocks.getOwnedFiles).toHaveBeenCalledWith(42, 7, "/plugins");
  });

  it("reads remote latest.log when Falix is configured", async () => {
    falixMocks.falixIsConfigured.mockReturnValue(true);
    falixMocks.falixReadFile.mockResolvedValue({ content: "[INFO] booted\n[WARN] slow tick" });
    dbMocks.getRecentServerLogs.mockResolvedValue([]);
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.logs({ id: 7 });
    expect(falixMocks.falixReadFile).toHaveBeenCalledWith("/logs/latest.log");
    expect(result.map(log => log.message)).toContain("[INFO] booted");
    expect(result.map(log => log.level)).toContain("warn");
  });

  it("creates and deletes remote Falix files with owner checks", async () => {
    falixMocks.falixIsConfigured.mockReturnValue(true);
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.files.create({ serverId: 7, parentPath: "/", name: "plugins", kind: "folder" });
    await caller.servers.files.delete({ serverId: 7, path: "/plugins" });
    expect(falixMocks.falixCreateFolder).toHaveBeenCalledWith("/", "plugins");
    expect(falixMocks.falixDeleteFiles).toHaveBeenCalledWith(["/plugins"]);
  });

  it("keeps server log queries owner-scoped", async () => {
    const caller = appRouter.createCaller(createContext(42));
    dbMocks.getRecentServerLogs.mockResolvedValue([
      {
        id: 1,
        ownerId: 42,
        serverId: 7,
        level: "warn",
        source: "minecraft",
        message: "Can't keep up!",
        createdAt: new Date(),
      },
    ]);
    const result = await caller.servers.logs({ id: 7 });
    expect(dbMocks.getOwnedServer).toHaveBeenCalledWith(42, 7);
    expect(dbMocks.getRecentServerLogs).toHaveBeenCalledWith(42, 7);
    expect(result).toHaveLength(1);
  });

  it("accepts owner-scoped runtime log callbacks with the adapter token", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    const ctx = createContext(42);
    ctx.req.headers = {
      "x-craftpanel-runtime-token": "runtime-secret",
    } as typeof ctx.req.headers;
    const caller = appRouter.createCaller(ctx);
    await caller.runtime.logCallback({
      serverId: 7,
      ownerId: 42,
      level: "error",
      source: "minecraft",
      message: "Server crashed",
    });
    expect(dbMocks.getOwnedServer).toHaveBeenCalledWith(42, 7);
    expect(dbMocks.createServerLog).toHaveBeenCalledWith(
      42,
      7,
      "error",
      "Server crashed",
      "minecraft"
    );
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("rejects a runtime log callback without the adapter token", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    const caller = appRouter.createCaller(createContext(42));
    await expect(
      caller.runtime.logCallback({
        serverId: 7,
        ownerId: 42,
        level: "info",
        source: "minecraft",
        message: "joined",
      })
    ).rejects.toThrow("Unauthorized runtime callback");
    expect(dbMocks.createServerLog).not.toHaveBeenCalled();
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("rejects a runtime callback without the adapter token", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    const caller = appRouter.createCaller(createContext(42));
    await expect(
      caller.runtime.backupCallback({
        backupId: 9,
        status: "failed",
        artifactStatus: "failed",
      })
    ).rejects.toThrow("Unauthorized runtime callback");
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("accepts an authenticated runtime completion callback", async () => {
    process.env.MINECRAFT_RUNTIME_TOKEN = "runtime-secret";
    dbMocks.updateBackupFromRuntime.mockResolvedValue({
      id: 9,
      status: "ready",
      artifactStatus: "ready",
    });
    const ctx = createContext(42);
    ctx.req.headers = {
      "x-craftpanel-runtime-token": "runtime-secret",
    } as typeof ctx.req.headers;
    const caller = appRouter.createCaller(ctx);
    const result = await caller.runtime.backupCallback({
      backupId: 9,
      status: "ready",
      artifactStatus: "ready",
      artifactKey: "node/backup-9.tar.gz",
      sizeGb: 3,
    });
    expect(dbMocks.updateBackupFromRuntime).toHaveBeenCalledWith(9, {
      backupId: 9,
      status: "ready",
      artifactStatus: "ready",
      artifactKey: "node/backup-9.tar.gz",
      sizeGb: 3,
    });
    expect(result).toMatchObject({ status: "ready", artifactStatus: "ready" });
    delete process.env.MINECRAFT_RUNTIME_TOKEN;
  });

  it("keeps restore status from the runtime adapter", async () => {
    dbMocks.requestOwnedBackupRestore.mockResolvedValue({
      status: "restoring",
      output: "Restore queued on game node",
    });
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.backupAction({
      id: 9,
      action: "restore",
    });
    expect(result.status).toBe("restoring");
    expect(result.output).toBe("Restore queued on game node");
  });

  it("marks artifact generation ready after a successful download", async () => {
    dbMocks.createOrGetBackupArtifact.mockResolvedValue({
      key: "42-backups/7/backup.json",
      url: "/manus-storage/42-backups/7/backup.json",
    });
    const caller = appRouter.createCaller(createContext(42));
    await caller.servers.backupAction({ id: 9, action: "download" });
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(
      1,
      42,
      9,
      "creating"
    );
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(
      2,
      42,
      9,
      "ready"
    );
  });

  it("marks artifact generation failed when the runtime rejects an archive", async () => {
    dbMocks.createOrGetBackupArtifact.mockRejectedValue(
      new Error("Runtime unavailable")
    );
    const caller = appRouter.createCaller(createContext(42));
    await expect(
      caller.servers.backupAction({ id: 9, action: "download" })
    ).rejects.toThrow("Runtime unavailable");
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(
      1,
      42,
      9,
      "creating"
    );
    expect(dbMocks.setOwnedBackupArtifactStatus).toHaveBeenNthCalledWith(
      2,
      42,
      9,
      "failed"
    );
  });

  it("returns an artifact URL for an owned backup download", async () => {
    dbMocks.createOrGetBackupArtifact.mockResolvedValue({
      key: "42-backups/7/backup.json",
      url: "/manus-storage/42-backups/7/backup.json",
    });
    const caller = appRouter.createCaller(createContext(42));
    const result = await caller.servers.backupAction({
      id: 9,
      action: "download",
    });
    expect(result.downloadReady).toBe(true);
    expect(result.downloadUrl).toBe("/manus-storage/42-backups/7/backup.json");
    expect(dbMocks.logServerAction).toHaveBeenCalledWith(
      42,
      7,
      "backup_download",
      "Luna SMP",
      "Secure download ready for Luna SMP"
    );
  });
});
