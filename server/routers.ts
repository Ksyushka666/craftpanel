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
  deleteOwnedFile,
  getOwnedBackup,
  getOwnedBackups,
  getOwnedFiles,
  getOwnedInstallations,
  getOwnedServer,
  getOwnedServers,
  getRecentServerActions,
  logServerAction,
  requestOwnedBackupRestore,
  setOwnedBackupArtifactStatus,
  updateBackupFromRuntime,
  updateOwnedServerConfig,
  updateOwnedServerStatus,
} from "./db";

const serverIdInput = z.object({ id: z.number().int().positive() });

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
  }),

  servers: router({
    list: protectedProcedure.query(({ ctx }) => getOwnedServers(ctx.user.id)),
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
        const output = input.action === "command"
          ? `[CraftPanel] Executed: ${input.command}`
          : `${input.action.toUpperCase()} accepted for ${server.name}`;
        if (input.action !== "command") {
          const status = input.action === "stop" ? "offline" : "online";
          await updateOwnedServerStatus(ctx.user.id, input.id, status);
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
          return getOwnedFiles(ctx.user.id, input.serverId, input.parentPath);
        }),
      create: protectedProcedure
        .input(z.object({ serverId: z.number().int().positive(), parentPath: z.string().default("/"), name: z.string().min(1).max(120), kind: z.enum(["file", "folder"]) }))
        .mutation(async ({ ctx, input }) => {
          const server = await getOwnedServer(ctx.user.id, input.serverId);
          if (!server) throw new Error("Server not found");
          await createOwnedFile(ctx.user.id, input.serverId, input.parentPath, input.name, input.kind);
          await logServerAction(ctx.user.id, input.serverId, `file_${input.kind}`, input.name, `${input.kind} created`);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number().int().positive() }))
        .mutation(({ ctx, input }) => deleteOwnedFile(ctx.user.id, input.id)),
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
