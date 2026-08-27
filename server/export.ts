import type { Express, Request, Response } from "express";
import { getAuditLogsForOwner, getServerAccess, getWebhookEventsForOwner } from "./db";
import { sdk } from "./_core/sdk";

export function csvCell(value: unknown) {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]) {
  return [headers, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}

function sendCsv(res: Response, filename: string, content: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(`\uFEFF${content}`);
}

async function authenticate(req: Request, res: Response) {
  try { return await sdk.authenticateRequest(req); } catch { res.status(401).json({ error: "Authentication required" }); return undefined; }
}

export function registerExportRoutes(app: Express) {
  app.get("/api/export/audit.csv", async (req, res) => {
    const user = await authenticate(req, res);
    if (!user) return;
    const serverId = Number(req.query.serverId);
    if (!Number.isInteger(serverId) || serverId <= 0 || !(await getServerAccess(user.id, serverId))) { res.status(403).json({ error: "Server access denied" }); return; }
    const rows = await getAuditLogsForOwner(user.id, serverId, 5000);
    sendCsv(res, `craftpanel-audit-${serverId}.csv`, toCsv(["id", "actorId", "serverId", "action", "target", "metadata", "createdAt"], rows.map(item => [item.id, item.actorId, item.serverId, item.action, item.target, item.metadata, item.createdAt])));
  });

  app.get("/api/export/webhooks.csv", async (req, res) => {
    const user = await authenticate(req, res);
    if (!user) return;
    const serverId = Number(req.query.serverId);
    if (!Number.isInteger(serverId) || serverId <= 0 || !(await getServerAccess(user.id, serverId))) { res.status(403).json({ error: "Server access denied" }); return; }
    const eventType = typeof req.query.eventType === "string" && req.query.eventType ? req.query.eventType : undefined;
    const status = typeof req.query.status === "string" && ["received", "duplicate", "failed"].includes(req.query.status) ? req.query.status as "received" | "duplicate" | "failed" : undefined;
    const search = typeof req.query.search === "string" && req.query.search ? req.query.search : undefined;
    const fromDate = typeof req.query.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.fromDate) ? new Date(`${req.query.fromDate}T00:00:00.000Z`) : undefined;
    const toDate = typeof req.query.toDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.toDate) ? new Date(`${req.query.toDate}T23:59:59.999Z`) : undefined;
    if (fromDate?.toString() === "Invalid Date" || toDate?.toString() === "Invalid Date") { res.status(400).json({ error: "Invalid webhook date filter" }); return; }
    const rows = await getWebhookEventsForOwner(user.id, serverId, { limit: 5000, eventType, status, search, fromDate, toDate });
    sendCsv(res, `craftpanel-webhooks-${serverId}.csv`, toCsv(["id", "webhookId", "eventKey", "eventType", "status", "payload", "createdAt"], rows.items.map(({ event }) => [event.id, event.webhookId, event.eventKey, event.eventType, event.status, event.payload, event.createdAt])));
  });
}
