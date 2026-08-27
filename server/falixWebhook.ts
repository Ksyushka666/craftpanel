import crypto from "node:crypto";
import type { Express, Request, Response } from "express";
import { createServerLog, getWebhookByExternalId, markWebhookDelivery, recordWebhookEvent } from "./db";

type WebhookEvent = { event?: string; server?: { id?: number }; occurred_at?: number; data?: unknown };

export function validFalixSignature(secret: string, body: Buffer, header: string | undefined) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac("sha256", secret).update(body).digest("hex")}`);
  const provided = Buffer.from(header);
  return expected.length === provided.length && crypto.timingSafeEqual(expected, provided);
}

export function registerFalixWebhookRoute(app: Express) {
  app.post("/api/falix/webhooks/:serverId/:hookId", async (req: Request, res: Response) => {
    let webhookId: number | undefined;
    let rawBody = "";
    try {
      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));
      rawBody = body.toString("utf8");
      const serverId = Number(req.params.serverId);
      const hookId = req.params.hookId;
      const webhook = await getWebhookByExternalId(serverId, hookId);
      if (!webhook || !webhook.enabled) return res.status(404).json({ error: "unknown webhook" });
      webhookId = webhook.id;
      if (!validFalixSignature(webhook.secret, body, req.header("X-Falix-Signature"))) return res.status(401).json({ error: "invalid signature" });
      const payload = JSON.parse(body.toString("utf8")) as WebhookEvent;
      const eventType = payload.event ?? req.header("X-Falix-Event") ?? "unknown";
      const deliveryId = req.header("X-Falix-Delivery-Id");
      const bodyHash = crypto.createHash("sha256").update(body).digest("hex");
      const eventKey = `${deliveryId ?? `${eventType}:${payload.server?.id ?? serverId}:${bodyHash}`}`;
      const accepted = await markWebhookDelivery(webhook.id, eventKey, eventType, body.toString("utf8"), payload.occurred_at ? new Date(payload.occurred_at * 1000) : undefined);
      if (accepted) await createServerLog(webhook.ownerId, serverId, "system", `Falix webhook: ${eventType}`, "falix-webhook");
      return res.status(202).json({ ok: true, duplicate: !accepted });
    } catch (error) {
      console.error("[Falix webhook] delivery failed", error);
      if (webhookId) { try { await recordWebhookEvent(webhookId, `failed:${Date.now()}`, "unknown", rawBody, "failed"); } catch (recordError) { console.error("[Falix webhook] failed status persistence failed", recordError); } }
      return res.status(500).json({ error: "webhook processing failed" });
    }
  });
}
