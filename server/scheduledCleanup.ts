import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { appLiveMessages, appMessageCleanupJobs } from "../drizzle/schema";
import { getDb } from "./db";
import { isMatchingScheduledTask, shouldRunDailyLiveMessageCleanup } from "./scheduledTaskAuth";
import { sdk } from "./_core/sdk";

const CLEANUP_JOB_KEY = "live-message-cleanup";

/** Idempotent scheduled cleanup. It clears only live messages, never operational history. */
export async function cleanupLiveMessagesHandler(req: Request, res: Response) {
  let taskUid: string | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    taskUid = user.taskUid ?? undefined;
    if (!user.isCron || !taskUid) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) throw new Error("Database is not available");

    const outcome = await db.transaction(async tx => {
      const job = (await tx.select().from(appMessageCleanupJobs).where(and(
        eq(appMessageCleanupJobs.jobKey, CLEANUP_JOB_KEY),
        eq(appMessageCleanupJobs.scheduleCronTaskUid, taskUid!),
      )).limit(1).for("update"))[0];
      if (!job || !isMatchingScheduledTask(user, job.scheduleCronTaskUid)) {
        return { skipped: "orphan" as const };
      }
      const now = new Date();
      if (!shouldRunDailyLiveMessageCleanup(job.lastRunAt, now)) {
        return { skipped: "already-ran" as const };
      }

      const deleteResult = await tx.delete(appLiveMessages);
      const deleted = Number(deleteResult[0].affectedRows ?? 0);
      await tx.update(appMessageCleanupJobs)
        .set({ lastRunAt: now })
        .where(eq(appMessageCleanupJobs.id, job.id));
      return { deleted };
    });

    return res.json({ ok: true, ...outcome, taskUid });
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
