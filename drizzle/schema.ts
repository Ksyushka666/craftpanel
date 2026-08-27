import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, index, uniqueIndex } from "drizzle-orm/mysql-core";

/** Core user table backing the Manus OAuth flow. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const minecraftServers = mysqlTable("minecraft_servers", {
  id: int("id").autoincrement().primaryKey(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 140 }).notNull(),
  serverType: mysqlEnum("serverType", ["java", "bedrock"]).default("java").notNull(),
  core: varchar("core", { length: 64 }).default("Paper").notNull(),
  version: varchar("version", { length: 32 }).default("1.21.1").notNull(),
  status: mysqlEnum("status", ["online", "offline", "starting", "stopping"]).default("offline").notNull(),
  maxPlayers: int("maxPlayers").default(20).notNull(),
  playersOnline: int("playersOnline").default(0).notNull(),
  tps: int("tps").default(20).notNull(),
  ramUsedMb: int("ramUsedMb").default(0).notNull(),
  ramTotalMb: int("ramTotalMb").default(4096).notNull(),
  cpuPercent: int("cpuPercent").default(0).notNull(),
  diskUsedGb: int("diskUsedGb").default(0).notNull(),
  diskTotalGb: int("diskTotalGb").default(40).notNull(),
  address: varchar("address", { length: 180 }),
  motd: varchar("motd", { length: 255 }),
  pvp: int("pvp").default(1).notNull(),
  onlineMode: int("onlineMode").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const serverActions = mysqlTable("server_actions", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  payload: text("payload"),
  output: text("output"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const serverLogs = mysqlTable("server_logs", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  level: mysqlEnum("level", ["system", "info", "warn", "error", "debug"]).default("info").notNull(),
  source: varchar("source", { length: 64 }).default("minecraft").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const serverBackups = mysqlTable("server_backups", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  sizeGb: int("sizeGb").default(0).notNull(),
  status: mysqlEnum("status", ["ready", "creating", "restoring", "failed"]).default("ready").notNull(),
  artifactStatus: mysqlEnum("artifactStatus", ["idle", "creating", "ready", "failed"]).default("idle").notNull(),
  artifactKey: varchar("artifactKey", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const catalogInstallations = mysqlTable("catalog_installations", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  catalogType: mysqlEnum("catalogType", ["modpack", "plugin", "map"]).notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  version: varchar("version", { length: 64 }).notNull(),
  status: mysqlEnum("status", ["queued", "installed", "failed"]).default("queued").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const serverMembers = mysqlTable("server_members", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "operator", "viewer"]).default("viewer").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  memberLookup: uniqueIndex("server_members_server_user_unique").on(table.serverId, table.userId),
  userLookup: index("server_members_user_idx").on(table.userId),
}));

export const serverWebhooks = mysqlTable("server_webhooks", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  externalHookId: varchar("externalHookId", { length: 128 }).notNull(),
  secret: varchar("secret", { length: 255 }).notNull(),
  enabled: int("enabled").default(1).notNull(),
  lastEventId: varchar("lastEventId", { length: 160 }),
  lastEventAt: timestamp("lastEventAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  hookLookup: uniqueIndex("server_webhooks_external_unique").on(table.serverId, table.externalHookId),
}));

export const webhookEvents = mysqlTable("webhook_events", {
  id: int("id").autoincrement().primaryKey(),
  webhookId: int("webhookId").notNull(),
  eventKey: varchar("eventKey", { length: 190 }).notNull(),
  eventType: varchar("eventType", { length: 100 }).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  eventUnique: uniqueIndex("webhook_events_key_unique").on(table.webhookId, table.eventKey),
}));

export const serverSchedules = mysqlTable("server_schedules", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
  action: mysqlEnum("action", ["restart"]).default("restart").notNull(),
  taskUid: varchar("taskUid", { length: 65 }),
  enabled: int("enabled").default(1).notNull(),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  ownerLookup: index("server_schedules_owner_idx").on(table.ownerId),
  taskLookup: uniqueIndex("server_schedules_task_uid_unique").on(table.taskUid),
}));

export const serverFiles = mysqlTable("server_files", {
  id: int("id").autoincrement().primaryKey(),
  serverId: int("serverId").notNull(),
  ownerId: int("ownerId").notNull(),
  path: varchar("path", { length: 255 }).notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  kind: mysqlEnum("kind", ["file", "folder"]).default("file").notNull(),
  sizeBytes: int("sizeBytes").default(0).notNull(),
  storageKey: varchar("storageKey", { length: 255 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type MinecraftServer = typeof minecraftServers.$inferSelect;
export type InsertMinecraftServer = typeof minecraftServers.$inferInsert;
export type ServerAction = typeof serverActions.$inferSelect;
export type ServerLog = typeof serverLogs.$inferSelect;
export type ServerBackup = typeof serverBackups.$inferSelect;
export type CatalogInstallation = typeof catalogInstallations.$inferSelect;
export type ServerFile = typeof serverFiles.$inferSelect;
export type ServerMember = typeof serverMembers.$inferSelect;
export type ServerWebhook = typeof serverWebhooks.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type ServerSchedule = typeof serverSchedules.$inferSelect;
