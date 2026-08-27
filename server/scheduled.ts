import type { Express, Request, Response } from "express";
import { getScheduleByTaskUid, updateScheduleRecord } from "./db";
import { falixIsConfigured, falixSendPower } from "./falix";
import { sdk } from "./_core/sdk";

export function registerScheduledRoutes(app: Express) {
  app.post("/api/scheduled/restart-server", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
      const schedule = await getScheduleByTaskUid(user.taskUid);
      if (!schedule || !schedule.enabled) return res.status(200).json({ ok: true, skipped: "orphan-or-disabled" });
      if (!falixIsConfigured()) return res.status(200).json({ ok: true, skipped: "provider-not-configured" });
      await falixSendPower("restart", schedule.serverId);
      await updateScheduleRecord(schedule.ownerId, schedule.id, { lastRunAt: new Date() });
      return res.status(200).json({ ok: true, scheduleId: schedule.id });
    } catch (error) {
      console.error("[Scheduled restart] failed", error);
      return res.status(500).json({ error: "scheduled restart failed", timestamp: new Date().toISOString() });
    }
  });
}
