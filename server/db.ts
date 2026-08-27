import { and, desc, eq } from "drizzle-orm";
import { storagePut } from "./storage";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  catalogInstallations,
  minecraftServers,
  serverActions,
  serverBackups,
  serverFiles,
  serverLogs,
  users,
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

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
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

export async function getOwnedServers(ownerId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(minecraftServers).where(eq(minecraftServers.ownerId, ownerId)).orderBy(desc(minecraftServers.updatedAt));
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
