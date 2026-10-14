import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { vehicleFlowSchedules } from "../drizzle/schema";
import { getDb } from "./db";
import { reconcileExpiredVehicleSessions } from "./vehicleFlowService";
import { isMatchingScheduledTask } from "./scheduledTaskAuth";
import { sdk } from "./_core/sdk";

const RECONCILE_JOB_KEY = "expired-session-reconciliation";

/** Scheduled backstop so expired sessions reconcile even when no client is polling. */
export async function reconcileVehicleSessionsHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid ?? undefined;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const job = (await db.select().from(vehicleFlowSchedules).where(and(
      eq(vehicleFlowSchedules.jobKey, RECONCILE_JOB_KEY),
      eq(vehicleFlowSchedules.scheduleCronTaskUid, taskUid),
    )).limit(1))[0];
    if (!job || job.isEnabled !== 1 || !isMatchingScheduledTask(user, job.scheduleCronTaskUid)) {
      return res.json({ ok: true, skipped: "orphan-or-disabled", taskUid });
    }

    const result = await reconcileExpiredVehicleSessions();
    return res.json({ ok: true, ...result, taskUid });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return res.status(500).json({
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
      context: { url: req.originalUrl, taskUid },
      timestamp: new Date().toISOString(),
    });
  }
}
