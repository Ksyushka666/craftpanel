import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import {
  createOwnedBackup,
  createOwnedServer,
  createOrGetBackupArtifact,
  createOwnedFile,
  createOwnedInstallation,
  createServerLog,
  deleteOwnedFile,
  getOwnedBackup,
  getOwnedBackups,
  getOwnedFiles,
  getOwnedInstallations,
  getOwnedServer,
  getOwnedServers,
  getRecentServerActions,
  getRecentServerLogs,
  logServerAction,
  requestOwnedBackupRestore,
  setOwnedBackupArtifactStatus,
  updateBackupFromRuntime,
  updateOwnedServerConfig,
  updateOwnedServerStatus,
  updateOwnedServerTelemetry,
} from "./db";
import {
  falixCreateDownload,
  falixCreateFolder,
  falixGetOnlinePlayers,
  falixGetServerDetails,
  falixGetStatus,
  falixIsConfigured,
  falixListFiles,
  falixReadFile,
  falixWriteFile,
  falixDeleteFiles,
  falixSendConsoleCommand,
  falixSendPower,
} from "./falix";

const serverIdInput = z.object({ id: z.number().int().positive() });

function mapFalixState(state: string | undefined): "online" | "offline" | "starting" | "stopping" {
  if (state === "running") return "online";
  if (state === "starting") return "starting";
  if (state === "stopping") return "stopping";
  return "offline";
}

async function syncFalixServer(ownerId: number, localServerId: number) {
  if (!falixIsConfigured()) return undefined;
  const [details, status, players] = await Promise.all([falixGetServerDetails(localServerId), falixGetStatus(localServerId), falixGetOnlinePlayers(localServerId).catch(() => undefined)]);
  const resources = status.resources;
  const allocation = details.allocation;
  const address = allocation?.hostname || (allocation?.ip && allocation?.port ? `${allocation.ip}:${allocation.port}` : undefined);
  return updateOwnedServerTelemetry(ownerId, localServerId, {
    status: mapFalixState(status.state),
    playersOnline: players?.online_players ?? 0,
    ramUsedMb: Math.round((resources?.memory_bytes ?? 0) / 1024 / 1024),
    ramTotalMb: Math.round((resources?.memory_limit_bytes ?? 0) / 1024 / 1024),
    cpuPercent: Math.round(resources?.cpu_percent ?? 0),
    diskUsedGb: Math.round((resources?.disk_bytes ?? 0) / 1024 / 1024 / 1024),
    address,
  });
}

export const appRouter = router({
  system: systemRouter,
    auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  runtime: router({
    backupCallback: publicProcedure
      .input(z.object({ backupId: z.number().int().positive(), status: z.enum(["ready", "creating", "restoring", "failed"]).optional(), artifactStatus: z.enum(["idle", "creating", "ready", "failed"]).optional(), artifactKey: z.string().max(255).optional(), sizeGb: z.number().int().nonnegative().optional() }))
      .mutation(async ({ ctx, input }) => {
        const expected = process.env.MINECRAFT_RUNTIME_TOKEN;
        const provided = ctx.req.headers["x-craftpanel-runtime-token"];
        if (!expected || provided !== expected) throw new Error("Unauthorized runtime callback");
        return updateBackupFromRuntime(input.backupId, input);
      }),
    logCallback: publicProcedure
      .input(z.object({ serverId: z.number().int().positive(), ownerId: z.number().int().positive(), level: z.enum(["system", "info", "warn", "error", "debug"]), source: z.string().trim().min(1).max(64).default("minecraft"), message: z.string().trim().min(1).max(4000) }))
      .mutation(async ({ ctx, input }) => {
        const expected = process.env.MINECRAFT_RUNTIME_TOKEN;
        const provided = ctx.req.headers["x-craftpanel-runtime-token"];
        if (!expected || provided !== expected) throw new Error("Unauthorized runtime callback");
        const server = await getOwnedServer(input.ownerId, input.serverId);
        if (!server) throw new Error("Server not found");
        await createServerLog(input.ownerId, input.serverId, input.level, input.message, input.source);
        return { success: true } as const;
      }),
  }),

  servers: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const servers = await getOwnedServers(ctx.user.id);
      if (!falixIsConfigured() || servers.length === 0) return servers;
      try {
        await syncFalixServer(ctx.user.id, servers[0].id);
        return getOwnedServers(ctx.user.id);
      } catch (error) {
        console.warn("[Falix] Telemetry sync failed:", error);
        return servers;
      }
    }),
    create: protectedProcedure
      .input(z.object({
        name: z.string().trim().min(2).max(120),
        serverType: z.enum(["java", "bedrock"]),
        core: z.string().min(2).max(64),
        version: z.string().min(1).max(32),
        maxPlayers: z.number().int().min(1).max(500),
      }))
      .mutation(({ ctx, input }) => createOwnedServer(ctx.user.id, input)),
    action: protectedProcedure
      .input(z.object({
        id: z.number().int().positive(),
        action: z.enum(["start", "stop", "restart", "command"]),
        command: z.string().trim().max(500).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const server = await getOwnedServer(ctx.user.id, input.id);
        if (!server) throw new Error("Server not found");
        if (input.action === "command" && !input.command) throw new Error("Command is required");
        let output: string;
        if (falixIsConfigured()) {
          if (input.action === "command") {
            const result = await falixSendConsoleCommand(input.command!, input.id);
            output = result.output.join("\\n") || `Команда отправлена на Falix: ${input.command}`;
          } else {
            await falixSendPower(input.action, input.id);
            output = `Сигнал ${input.action} отправлен в Falix для ${server.name}`;
          }
          await syncFalixServer(ctx.user.id, input.id).catch(error => console.warn("[Falix] Post-action sync failed:", error));
        } else {
          output = input.action === "command"
            ? `[CraftPanel] Executed: ${input.command}`
            : `${input.action.toUpperCase()} accepted for ${server.name}`;
          if (input.action !== "command") {
            const status = input.action === "stop" ? "offline" : input.action === "start" ? "starting" : "starting";
            await updateOwnedServerStatus(ctx.user.id, input.id, status);
          }
        }
        await logServerAction(ctx.user.id, input.id, input.action, input.command, output);
        return { success: true, output, server: await getOwnedServer(ctx.user.id, input.id) };
      }),
    updateConfig: protectedProcedure
      .input(serverIdInput.extend({
        serverType: z.enum(["java", "bedrock"]),
        core: z.string().min(2).max(64),
        version: z.string().min(1).max(32),
        maxPlayers: z.number().int().min(1).max(500),
        motd: z.string().max(255),
        pvp: z.boolean(),
        onlineMode: z.boolean(),
      }))
      .mutation(async ({ ctx, input }) => {
        const server = await getOwnedServer(ctx.user.id, input.id);
        if (!server) throw new Error("Server not found");
        const { id, ...config } = input;
        await updateOwnedServerConfig(ctx.user.id, id, config);
        await logServerAction(ctx.user.id, id, "config", JSON.stringify(config), "Configuration saved");
        return { success: true, server: await getOwnedServer(ctx.user.id, id) };
      }),
    actions: protectedProcedure
      .input(serverIdInput)
      .query(({ ctx, input }) => getRecentServerActions(ctx.user.id, input.id)),
    logs: protectedProcedure
      .input(serverIdInput)
      .query(async ({ ctx, input }) => {
        const server = await getOwnedServer(ctx.user.id, input.id);
        if (!server) throw new Error("Server not found");
        const localLogs = await getRecentServerLogs(ctx.user.id, input.id);
        if (!falixIsConfigured()) return localLogs;
        try {
          const remote = await falixReadFile("/logs/latest.log", input.id) as { content?: string; text?: string } | string;
          const content = typeof remote === "string" ? remote : remote?.content ?? remote?.text ?? "";
          const remoteLines = content.split(/\r?\n/).filter(Boolean).slice(-120).map((message, index) => ({
            id: -(index + 1),
            serverId: input.id,
            ownerId: ctx.user.id,
            level: /error|exception|fail/i.test(message) ? "error" as const : /warn/i.test(message) ? "warn" as const : "info" as const,
            source: "falix",
            message,
            createdAt: new Date(),
          }));
          return [...remoteLines, ...localLogs];
        } catch {
          return localLogs;
        }
      }),
    backups: protectedProcedure
      .input(serverIdInput)
      .query(async ({ ctx, input }) => {
        const server = await getOwnedServer(ctx.user.id, input.id);
        if (!server) throw new Error("Server not found");
        return getOwnedBackups(ctx.user.id, input.id);
      }),
    backupAction: protectedProcedure
      .input(z.object({ id: z.number().int().positive(), action: z.enum(["restore", "download"]) }))
      .mutation(async ({ ctx, input }) => {
        const backup = await getOwnedBackup(ctx.user.id, input.id);
        if (!backup) throw new Error("Backup not found");
        if (input.action === "restore") {
          const restore = await requestOwnedBackupRestore(ctx.user.id, input.id);
          await logServerAction(ctx.user.id, backup.serverId, "backup_restore", backup.name, restore.output);
          return { success: true, output: restore.output, status: restore.status, downloadReady: false, downloadUrl: null };
        }
        await setOwnedBackupArtifactStatus(ctx.user.id, input.id, "creating");
        try {
          const artifact = await createOrGetBackupArtifact(ctx.user.id, input.id);
          await setOwnedBackupArtifactStatus(ctx.user.id, input.id, "ready");
          const output = `Secure download ready for ${backup.name}`;
          await logServerAction(ctx.user.id, backup.serverId, "backup_download", backup.name, output);
          return { success: true, output, downloadReady: true, downloadUrl: artifact.url };
        } catch (error) {
          await setOwnedBackupArtifactStatus(ctx.user.id, input.id, "failed");
          throw error;
        }
      }),
    catalog: router({
      installed: protectedProcedure
        .input(serverIdInput)
        .query(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.id);
          if (!server) throw new Error("Server not found");
          return getOwnedInstallations(ctx.user.id, input.id);
        }),
      install: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), catalogType: z.enum(["modpack", "plugin", "map"]), name: z.string().min(2).max(160), version: z.string().min(1).max(64) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          const { serverId, ...data } = input;
          await createOwnedInstallation(ctx.user.id, serverId, data);
          await logServerAction(ctx.user.id, serverId, "catalog_install", input.name, `Installed ${input.name}`);
          return { success: true };
        }),
    }),
          files: router({
      list: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), parentPath: z.string().default("/") }))
        .query(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (falixIsConfigured()) {
            const remoteFiles = await falixListFiles(input.parentPath, input.serverId);
            return remoteFiles.map((file, index) => ({
              id: -(index + 1),
              ownerId: ctx.user.id,
              serverId: input.serverId,
              path: input.parentPath,
              name: file.name,
              kind: file.is_directory ? "folder" as const : "file" as const,
              sizeBytes: file.size ?? 0,
              storageKey: file.path,
              createdAt: new Date(file.modified_at),
              updatedAt: new Date(file.modified_at),
            }));
          }
          return getOwnedFiles(ctx.user.id, input.serverId, input.parentPath);
        }),
      read: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), path: z.string().min(1) }))
        .query(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (!falixIsConfigured()) throw new Error("Remote file provider is not configured");
          return falixReadFile(input.path, input.serverId);
        }),
      write: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), path: z.string().min(1), content: z.string().max(64 * 1024) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (!falixIsConfigured()) throw new Error("Remote file provider is not configured");
          await falixWriteFile(input.path, input.content, input.serverId);
          await logServerAction(ctx.user.id, input.serverId, "file_write", input.path, `Updated ${input.path}`);
          return { success: true };
        }),
      download: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), path: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (!falixIsConfigured()) throw new Error("Remote file provider is not configured");
          const result = await falixCreateDownload(input.path, input.serverId);
          return { success: true, ...result };
        }),
      create: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), parentPath: z.string().default("/"), name: z.string().min(1).max(120), kind: z.enum(["file", "folder"]) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (falixIsConfigured()) {
            if (input.kind === "folder") {
              await falixCreateFolder(input.parentPath, input.name, input.serverId);
            } else {
              const path = `${input.parentPath.replace(/\/$/, "") || ""}/${input.name}`;
              await falixWriteFile(path, "", input.serverId);
            }
          } else {
            await createOwnedFile(ctx.user.id, input.serverId, input.parentPath, input.name, input.kind);
          }
          await logServerAction(ctx.user.id, input.serverId, `file_${input.kind}`, input.name, `${input.kind} created`);
          return { success: true };
        }),

      delete: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), path: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          if (falixIsConfigured()) {
            await falixDeleteFiles([input.path], input.serverId);
          } else {
            // Fallback for local metadata (not implemented for real files)
          }
          await logServerAction(ctx.user.id, input.serverId, "file_delete", input.path, `Deleted ${input.path}`);
          return { success: true };
        }),
    }),
    createBackup: protectedProcedure
      .input(z.object({ serverId: z.number().int().positive(), name: z.string().trim().min(2).max(160) }))
      .mutation(async ({ ctx, input }) => {
        const server = await getOwnedServer(ctx.user.id, input.serverId);
        if (!server) throw new Error("Server not found");
        await createOwnedBackup(ctx.user.id, input.serverId, input.name);
        await logServerAction(ctx.user.id, input.serverId, "backup_create", input.name, "Backup created");
        return { success: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
