import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { mechanicRepairExportSchedules } from "../drizzle/schema";
import { getDb } from "./db";
import { exportPendingMechanicRepairRecords } from "./repairLogExportService";
import { MECHANIC_REPAIR_EXPORT_JOB_KEY, shouldRunMechanicRepairExport } from "./mechanicRepairExportSchedule";
import { isMatchingScheduledTask } from "./scheduledTaskAuth";
import { sdk } from "./_core/sdk";

/** Daily 20:00 Thailand callback. The row is deleted only after Sheets confirms the write. */
export async function exportMechanicRepairLogHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid ?? undefined;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) throw new Error("Database is not available");
    const job = (await db.select().from(mechanicRepairExportSchedules).where(and(
      eq(mechanicRepairExportSchedules.jobKey, MECHANIC_REPAIR_EXPORT_JOB_KEY),
      eq(mechanicRepairExportSchedules.scheduleCronTaskUid, taskUid),
    )).limit(1))[0];
    if (!job || job.isEnabled !== 1 || !isMatchingScheduledTask(user, job.scheduleCronTaskUid)) {
      return res.json({ ok: true, skipped: "orphan-or-disabled", taskUid });
    }

    const now = new Date();
    if (!shouldRunMechanicRepairExport(job.lastRunAt, now)) {
      return res.json({ ok: true, skipped: "already-ran-today", taskUid });
    }

    const result = await exportPendingMechanicRepairRecords();
    await db.update(mechanicRepairExportSchedules).set({ lastRunAt: now }).where(and(
      eq(mechanicRepairExportSchedules.id, job.id),
      eq(mechanicRepairExportSchedules.scheduleCronTaskUid, taskUid),
    ));
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
