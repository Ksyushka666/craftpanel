import { and, desc, eq, gte, like, lte } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";
import { storagePut } from "./storage";
import { drizzle } from "drizzle-orm/mysql2";
import { sql } from "drizzle-orm";
import {
  InsertUser,
  catalogInstallations,
  minecraftServers,
  serverActions,
  serverBackups,
  serverFiles,
  serverLogs,
  serverMembers,
  serverSchedules,
  serverWebhooks,
  webhookEvents,
  users,
  auditLogs,
  serverInvitations,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      if (process.env.DATABASE_SSL === "true") {
        _db = drizzle({
          connection: {
            uri: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: true },
          },
        });
      } else {
        _db = drizzle(process.env.DATABASE_URL);
      }
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/** Additive compatibility migration for deployments created before custom auth fields existed. */
export async function ensureCustomAuthSchema() {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.execute(sql.raw("ALTER TABLE users ADD COLUMN IF NOT EXISTS passwordHash varchar(255) NULL"));
    await db.execute(sql.raw("ALTER TABLE users ADD COLUMN IF NOT EXISTS discordId varchar(64) NULL"));
    await db.execute(sql.raw("ALTER TABLE users ADD COLUMN IF NOT EXISTS loginMethod varchar(64) NULL"));
    await db.execute(sql.raw("CREATE UNIQUE INDEX IF NOT EXISTS users_discord_id_unique ON users (discordId)"));
    return true;
  } catch (error) {
    console.error("[Database] Custom auth schema migration failed:", error);
    return false;
  }
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod", "passwordHash", "discordId"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserByDiscordId(discordId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.discordId, discordId)).limit(1);
  return result[0];
}

export async function createLocalAuthUser(input: {
  name: string;
  email: string;
  passwordHash?: string;
  discordId?: string;
  loginMethod: "email" | "discord";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const openId = `${input.loginMethod}_${randomBytes(16).toString("hex")}`;
  await db.insert(users).values({
    openId,
    name: input.name,
    email: input.email,
    passwordHash: input.passwordHash,
    discordId: input.discordId,
    loginMethod: input.loginMethod,
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(openId);
}

export async function updateUserAuthIdentity(userId: number, input: {
  name?: string;
  email?: string | null;
  passwordHash?: string | null;
  discordId?: string | null;
  loginMethod?: "email" | "discord";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(users).set({ ...input, lastSignedIn: new Date() }).where(eq(users.id, userId));
  const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return result[0];
}

export async function getOwnedServers(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(minecraftServers).where(eq(minecraftServers.ownerId, ownerId)).orderBy(desc(minecraftServers.updatedAt));
}

export type ServerAccessRole = "owner" | "admin" | "operator" | "viewer";

export async function getServerAccess(userId: number, serverId: number): Promise<{ server: Awaited<ReturnType<typeof getOwnedServer>>; role: ServerAccessRole } | undefined> {
  const server = await getOwnedServer(userId, serverId);
  if (server) return { server, role: "owner" };
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select({ server: minecraftServers, role: serverMembers.role }).from(serverMembers)
    .innerJoin(minecraftServers, eq(serverMembers.serverId, minecraftServers.id))
    .where(and(eq(serverMembers.userId, userId), eq(serverMembers.serverId, serverId))).limit(1);
  const row = rows[0];
  return row ? { server: row.server, role: row.role } : undefined;
}

export async function getOwnedServer(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select()
    .from(minecraftServers)
    .where(and(eq(minecraftServers.id, serverId), eq(minecraftServers.ownerId, ownerId)))
    .limit(1);
  return result[0];
}

export async function createOwnedServer(ownerId: number, data: {
  name: string;
  serverType: "java" | "bedrock";
  core: string;
  version: string;
  maxPlayers: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const slug = `${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`;
  await db.insert(minecraftServers).values({
    ownerId,
    slug,
    name: data.name,
    serverType: data.serverType,
    core: data.core,
    version: data.version,
    maxPlayers: data.maxPlayers,
    status: "offline",
    address: `${slug}.play.craftpanel.local`,
    motd: "Новый сервер CraftPanel",
  });
  const servers = await getOwnedServers(ownerId);
  const createdServer = servers.find(server => server.slug === slug);
  if (createdServer) {
    await db.insert(serverFiles).values([
      { ownerId, serverId: createdServer.id, path: "/", name: "plugins", kind: "folder" },
      { ownerId, serverId: createdServer.id, path: "/", name: "world", kind: "folder" },
      { ownerId, serverId: createdServer.id, path: "/", name: "server.properties", kind: "file", sizeBytes: 1240 },
      { ownerId, serverId: createdServer.id, path: "/", name: "ops.json", kind: "file", sizeBytes: 48 },
    ]);
  }
  return createdServer;
}

export async function updateOwnedServerStatus(ownerId: number, serverId: number, status: "online" | "offline" | "starting" | "stopping") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(minecraftServers).set({ status }).where(and(eq(minecraftServers.id, serverId), eq(minecraftServers.ownerId, ownerId)));
  return getOwnedServer(ownerId, serverId);
}

export async function updateOwnedServerTelemetry(ownerId: number, serverId: number, telemetry: {
  status: "online" | "offline" | "starting" | "stopping";
  playersOnline?: number;
  ramUsedMb?: number;
  ramTotalMb?: number;
  cpuPercent?: number;
  diskUsedGb?: number;
  address?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(minecraftServers).set({
    status: telemetry.status,
    ...(telemetry.playersOnline === undefined ? {} : { playersOnline: telemetry.playersOnline }),
    ...(telemetry.ramUsedMb === undefined ? {} : { ramUsedMb: telemetry.ramUsedMb }),
    ...(telemetry.ramTotalMb === undefined ? {} : { ramTotalMb: telemetry.ramTotalMb }),
    ...(telemetry.cpuPercent === undefined ? {} : { cpuPercent: telemetry.cpuPercent }),
    ...(telemetry.diskUsedGb === undefined ? {} : { diskUsedGb: telemetry.diskUsedGb }),
    ...(telemetry.address === undefined ? {} : { address: telemetry.address }),
  }).where(and(eq(minecraftServers.id, serverId), eq(minecraftServers.ownerId, ownerId)));
  return getOwnedServer(ownerId, serverId);
}

export async function updateOwnedServerConfig(ownerId: number, serverId: number, data: {
  serverType: "java" | "bedrock";
  core: string;
  version: string;
  maxPlayers: number;
  motd: string;
  pvp: boolean;
  onlineMode: boolean;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(minecraftServers).set({
    serverType: data.serverType,
    core: data.core,
    version: data.version,
    maxPlayers: data.maxPlayers,
    motd: data.motd,
    pvp: data.pvp ? 1 : 0,
    onlineMode: data.onlineMode ? 1 : 0,
  }).where(and(eq(minecraftServers.id, serverId), eq(minecraftServers.ownerId, ownerId)));
  return getOwnedServer(ownerId, serverId);
}

export type ServerLogLevel = "system" | "info" | "warn" | "error" | "debug";

export async function createServerLog(ownerId: number, serverId: number, level: ServerLogLevel, message: string, source = "minecraft") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(serverLogs).values({ ownerId, serverId, level, source, message });
}

export async function logServerAction(ownerId: number, serverId: number, action: string, payload?: string, output?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(serverActions).values({ serverId, ownerId, action, payload, output });
  await recordAuditLog(ownerId, action, serverId, payload, output);
  await db.insert(serverLogs).values({ ownerId, serverId, level: action === "command" ? "info" : "system", source: "panel", message: output || payload || action });
  return getRecentServerActions(ownerId, serverId);
}

export async function getRecentServerActions(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverActions)
    .where(and(eq(serverActions.serverId, serverId), eq(serverActions.ownerId, ownerId)))
    .orderBy(desc(serverActions.createdAt))
    .limit(40);
}

export async function getRecentServerLogs(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverLogs)
    .where(and(eq(serverLogs.serverId, serverId), eq(serverLogs.ownerId, ownerId)))
    .orderBy(desc(serverLogs.createdAt))
    .limit(80);
}

export async function getOwnedInstallations(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(catalogInstallations)
    .where(and(eq(catalogInstallations.serverId, serverId), eq(catalogInstallations.ownerId, ownerId)))
    .orderBy(desc(catalogInstallations.createdAt));
}

export async function createOwnedInstallation(ownerId: number, serverId: number, data: { catalogType: "modpack" | "plugin" | "map"; name: string; version: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(catalogInstallations).values({ ownerId, serverId, ...data, status: "queued" });
  return getOwnedInstallations(ownerId, serverId);
}

export async function getOwnedFiles(ownerId: number, serverId: number, parentPath = "/") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverFiles)
    .where(and(eq(serverFiles.serverId, serverId), eq(serverFiles.ownerId, ownerId), eq(serverFiles.path, parentPath)))
    .orderBy(desc(serverFiles.kind), serverFiles.name);
}

export async function createOwnedFile(ownerId: number, serverId: number, parentPath: string, name: string, kind: "file" | "folder") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const safeParent = parentPath.startsWith("/") ? parentPath.replace(/\/$/, "") || "/" : "/";
  const safeName = name.trim().replace(/[\\/]/g, "").slice(0, 120);
  if (!safeName) throw new Error("File name is required");
  await db.insert(serverFiles).values({ ownerId, serverId, path: safeParent, name: safeName, kind, sizeBytes: 0 });
  return getOwnedFiles(ownerId, serverId, safeParent);
}

export async function deleteOwnedFile(ownerId: number, fileId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(serverFiles).where(and(eq(serverFiles.id, fileId), eq(serverFiles.ownerId, ownerId)));
  return { success: true };
}

export async function getOwnedBackups(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverBackups)
    .where(and(eq(serverBackups.serverId, serverId), eq(serverBackups.ownerId, ownerId)))
    .orderBy(desc(serverBackups.createdAt));
}

export async function getOwnedBackup(ownerId: number, backupId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(serverBackups)
    .where(and(eq(serverBackups.id, backupId), eq(serverBackups.ownerId, ownerId)))
    .limit(1);
  return result[0];
}

export async function createOwnedBackup(ownerId: number, serverId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(serverBackups).values({ ownerId, serverId, name, sizeGb: 2, status: "ready" });
  return getOwnedBackups(ownerId, serverId);
}

export async function setOwnedBackupStatus(ownerId: number, backupId: number, status: "ready" | "creating" | "restoring" | "failed") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(serverBackups).set({ status }).where(and(eq(serverBackups.id, backupId), eq(serverBackups.ownerId, ownerId)));
}

export async function setOwnedBackupArtifactStatus(ownerId: number, backupId: number, artifactStatus: "idle" | "creating" | "ready" | "failed") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(serverBackups).set({ artifactStatus }).where(and(eq(serverBackups.id, backupId), eq(serverBackups.ownerId, ownerId)));
}

export async function updateBackupFromRuntime(backupId: number, update: { status?: "ready" | "creating" | "restoring" | "failed"; artifactStatus?: "idle" | "creating" | "ready" | "failed"; artifactKey?: string; sizeGb?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(serverBackups).set(update).where(eq(serverBackups.id, backupId));
  return getBackupById(backupId);
}

export async function getBackupById(backupId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(serverBackups).where(eq(serverBackups.id, backupId)).limit(1);
  return result[0];
}

export async function requestOwnedBackupRestore(ownerId: number, backupId: number) {
  const backup = await getOwnedBackup(ownerId, backupId);
  if (!backup) throw new Error("Backup not found");
  const runtimeUrl = process.env.MINECRAFT_RUNTIME_URL?.replace(/\/+$/, "");
  const runtimeToken = process.env.MINECRAFT_RUNTIME_TOKEN;
  if (!runtimeUrl || !runtimeToken) {
    throw new Error("Minecraft runtime adapter is not configured; connect a game node before restoring archives");
  }
  const response = await fetch(`${runtimeUrl}/v1/servers/${backup.serverId}/backups/${backup.id}/restore`, {
    method: "POST",
    headers: { Authorization: `Bearer ${runtimeToken}`, "Content-Type": "application/json" },
  });
  if (!response.ok) throw new Error(`Runtime restore request failed (${response.status})`);
  const result = await response.json() as { status?: "ready" | "restoring"; output?: string };
  const status = result.status ?? "restoring";
  await setOwnedBackupStatus(ownerId, backupId, status);
  return { status, output: result.output ?? `Restore request accepted for ${backup.name}` };
}

export async function createOrGetBackupArtifact(ownerId: number, backupId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const backup = await getOwnedBackup(ownerId, backupId);
  if (!backup) throw new Error("Backup not found");
  if (backup.artifactKey) return { key: backup.artifactKey, url: `/manus-storage/${backup.artifactKey}` };
  const runtimeUrl = process.env.MINECRAFT_RUNTIME_URL?.replace(/\/+$/, "");
  const runtimeToken = process.env.MINECRAFT_RUNTIME_TOKEN;
  if (!runtimeUrl || !runtimeToken) {
    throw new Error("Minecraft runtime adapter is not configured; connect a game node before downloading archives");
  }
  const response = await fetch(`${runtimeUrl}/v1/servers/${backup.serverId}/backups/${backup.id}/artifact`, {
    headers: { Authorization: `Bearer ${runtimeToken}` },
  });
  if (!response.ok) throw new Error(`Runtime archive request failed (${response.status})`);
  const artifact = await response.json() as { key: string; url: string; sizeGb?: number };
  if (!artifact.key || !artifact.url) throw new Error("Runtime returned an invalid backup artifact");
  await db.update(serverBackups).set({ artifactKey: artifact.key, sizeGb: artifact.sizeGb ?? backup.sizeGb }).where(and(eq(serverBackups.id, backupId), eq(serverBackups.ownerId, ownerId)));
  return artifact;
}

export async function getServerMembers(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  const server = await getOwnedServer(ownerId, serverId);
  if (!server) throw new Error("Server not found");
  return db.select({ id: serverMembers.id, userId: serverMembers.userId, role: serverMembers.role, createdAt: serverMembers.createdAt, name: users.name, email: users.email })
    .from(serverMembers).innerJoin(users, eq(serverMembers.userId, users.id)).where(eq(serverMembers.serverId, serverId));
}

export async function upsertServerMember(ownerId: number, serverId: number, userId: number, role: "admin" | "operator" | "viewer") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const server = await getOwnedServer(ownerId, serverId);
  if (!server) throw new Error("Server not found");
  await db.insert(serverMembers).values({ serverId, userId, role }).onDuplicateKeyUpdate({ set: { role } });
  return getServerMembers(ownerId, serverId);
}

export async function deleteServerMember(ownerId: number, serverId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const server = await getOwnedServer(ownerId, serverId);
  if (!server) throw new Error("Server not found");
  await db.delete(serverMembers).where(and(eq(serverMembers.serverId, serverId), eq(serverMembers.userId, userId)));
  return getServerMembers(ownerId, serverId);
}

export async function getOwnedSchedules(ownerId: number, serverId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverSchedules).where(and(eq(serverSchedules.ownerId, ownerId), eq(serverSchedules.serverId, serverId))).orderBy(desc(serverSchedules.createdAt));
}

export async function createScheduleRecord(ownerId: number, data: { serverId: number; name: string; cronExpression: string; taskUid: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(serverSchedules).values({ ...data, ownerId, action: "restart", enabled: 1 });
  return getOwnedSchedules(ownerId, data.serverId);
}

export async function updateScheduleRecord(ownerId: number, id: number, patch: { enabled?: number; taskUid?: string; lastRunAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(serverSchedules).set(patch).where(and(eq(serverSchedules.id, id), eq(serverSchedules.ownerId, ownerId)));
  const rows = await db.select().from(serverSchedules).where(and(eq(serverSchedules.id, id), eq(serverSchedules.ownerId, ownerId))).limit(1);
  return rows[0];
}

export async function getWebhookByExternalId(serverId: number, externalHookId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(serverWebhooks).where(and(eq(serverWebhooks.serverId, serverId), eq(serverWebhooks.externalHookId, externalHookId))).limit(1);
  return rows[0];
}

export async function saveServerWebhook(ownerId: number, data: { serverId: number; externalHookId: string; secret: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(serverWebhooks).values({ ...data, ownerId, enabled: 1 }).onDuplicateKeyUpdate({ set: { secret: data.secret, enabled: 1 } });
  return getWebhookByExternalId(data.serverId, data.externalHookId);
}

export async function recordWebhookEvent(webhookId: number, eventKey: string, eventType: string, payload: string, status: "received" | "duplicate" | "failed" = "received") {
  const db = await getDb();
  if (!db) return false;
  try {
    await db.insert(webhookEvents).values({ webhookId, eventKey, eventType, status, payload });
    return true;
  } catch (error) {
    if (/duplicate|unique/i.test(String(error))) {
      const duplicateKey = `${eventKey}:duplicate:${Date.now()}`;
      await db.insert(webhookEvents).values({ webhookId, eventKey: duplicateKey.slice(0, 190), eventType, status: "duplicate", payload });
      return false;
    }
    throw error;
  }
}

export async function markWebhookDelivery(webhookId: number, eventKey: string, eventType: string, payload: string, occurredAt?: Date) {
  const db = await getDb();
  if (!db) return false;
  const inserted = await recordWebhookEvent(webhookId, eventKey, eventType, payload);
  if (!inserted) return false;
  await db.update(serverWebhooks).set({ lastEventId: eventKey, lastEventAt: occurredAt ?? new Date() }).where(eq(serverWebhooks.id, webhookId));
  return true;
}

export async function getScheduleByTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(serverSchedules).where(eq(serverSchedules.taskUid, taskUid)).limit(1);
  return rows[0];
}

export async function listSchedulesForOwner(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(serverSchedules).where(eq(serverSchedules.ownerId, ownerId)).orderBy(desc(serverSchedules.createdAt));
}

export async function deleteScheduleRecord(ownerId: number, scheduleId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(serverSchedules).where(and(eq(serverSchedules.id, scheduleId), eq(serverSchedules.ownerId, ownerId)));
  return { success: true };
}

export async function getWebhookEventsForOwner(ownerId: number, serverId: number, options: { limit?: number; offset?: number; eventType?: string; status?: "received" | "duplicate" | "failed"; search?: string; fromDate?: Date; toDate?: Date } = {}) {
  const db = await getDb();
  if (!db) return { items: [], nextOffset: null };
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 5000);
  const offset = Math.max(options.offset ?? 0, 0);
  const filters = [eq(serverWebhooks.ownerId, ownerId), eq(serverWebhooks.serverId, serverId)];
  if (options.eventType) filters.push(eq(webhookEvents.eventType, options.eventType));
  if (options.status) filters.push(eq(webhookEvents.status, options.status));
  if (options.search) filters.push(like(webhookEvents.eventKey, `%${options.search.slice(0, 80)}%`));
  if (options.fromDate) filters.push(gte(webhookEvents.createdAt, options.fromDate));
  if (options.toDate) filters.push(lte(webhookEvents.createdAt, options.toDate));
  const rows = await db.select({ event: webhookEvents, webhook: serverWebhooks })
    .from(webhookEvents)
    .innerJoin(serverWebhooks, eq(webhookEvents.webhookId, serverWebhooks.id))
    .where(and(...filters))
    .orderBy(desc(webhookEvents.createdAt))
    .limit(limit + 1)
    .offset(offset);
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null };
}

export async function createServerInvitation(inviterId: number, serverId: number, email: string, role: "admin" | "operator" | "viewer") {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await db.insert(serverInvitations).values({ inviterId, serverId, email: email.toLowerCase(), role, tokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
  return { token, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) };
}

export async function acceptServerInvitation(token: string, userId: number, email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const rows = await db.select().from(serverInvitations).where(eq(serverInvitations.tokenHash, tokenHash)).limit(1);
  const invitation = rows[0];
  if (!invitation || invitation.acceptedAt || invitation.expiresAt.getTime() < Date.now() || invitation.email !== email.toLowerCase()) throw new Error("Invitation is invalid or expired");
  await db.insert(serverMembers).values({ serverId: invitation.serverId, userId, role: invitation.role }).onDuplicateKeyUpdate({ set: { role: invitation.role } });
  await db.update(serverInvitations).set({ acceptedAt: new Date() }).where(eq(serverInvitations.id, invitation.id));
  return { success: true, serverId: invitation.serverId, role: invitation.role };
}

export async function getAuditLogsForOwner(ownerId: number, serverId?: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const conditions = serverId ? eq(auditLogs.serverId, serverId) : eq(auditLogs.actorId, ownerId);
  return db.select().from(auditLogs).where(conditions).orderBy(desc(auditLogs.createdAt)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function recordAuditLog(actorId: number, action: string, serverId?: number, target?: string, metadata?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(auditLogs).values({ actorId, action, serverId, target, metadata });
}

export async function getEnabledWebhookForServer(serverId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(serverWebhooks).where(and(eq(serverWebhooks.serverId, serverId), eq(serverWebhooks.enabled, 1))).limit(1);
  return rows[0];
}

export async function getAccessibleServers(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const owned = await db.select().from(minecraftServers).where(eq(minecraftServers.ownerId, userId));
  const shared = await db.select({ server: minecraftServers }).from(serverMembers)
    .innerJoin(minecraftServers, eq(serverMembers.serverId, minecraftServers.id))
    .where(eq(serverMembers.userId, userId));
  const byId = new Map<number, typeof minecraftServers.$inferSelect>();
  [...owned, ...shared.map(row => row.server)].forEach(server => byId.set(server.id, server));
  return Array.from(byId.values()).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
}
