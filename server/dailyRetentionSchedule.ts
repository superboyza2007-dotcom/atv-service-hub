import { appMessageCleanupJobs } from "../drizzle/schema";
import { getDb } from "./db";
import {
  createHeartbeatJob,
  listHeartbeatJobs,
  updateHeartbeatJob,
  type HeartbeatJobInfo,
} from "./_core/heartbeat";

export const DAILY_RETENTION_CLEANUP_JOB_KEY = "live-message-cleanup";
export const DAILY_RETENTION_CLEANUP_JOB_NAME = "atv-daily-live-message-retention-cleanup";
/** Heartbeat cron is UTC; 00:00 UTC is 07:00 in Asia/Bangkok. */
export const DAILY_RETENTION_CLEANUP_CRON = "0 0 0 * * *";
export const DAILY_RETENTION_CLEANUP_PATH = "/api/scheduled/cleanup-live-messages";
const PAGE_SIZE = 200;
const DESCRIPTION = "ลบเฉพาะข้อความชั่วคราวของระบบทุกวันเวลา 07:00 น. ตามเวลาไทย โดยไม่แตะประวัติถาวร";

type HeartbeatJobShape = Pick<HeartbeatJobInfo, "cronExpression" | "callbackPath" | "callbackMethod" | "isEnable">;

export function needsDailyRetentionHeartbeatUpdate(job: HeartbeatJobShape | undefined): boolean {
  return !job
    || job.cronExpression !== DAILY_RETENTION_CLEANUP_CRON
    || job.callbackPath !== DAILY_RETENTION_CLEANUP_PATH
    || job.callbackMethod !== "POST"
    || !job.isEnable;
}

async function findExistingHeartbeatJob(): Promise<HeartbeatJobInfo | undefined> {
  const firstPage = await listHeartbeatJobs("", { page: 1, pageSize: PAGE_SIZE });
  const firstMatch = firstPage.jobs.find(job => job.name === DAILY_RETENTION_CLEANUP_JOB_NAME);
  if (firstMatch) return firstMatch;

  const pageCount = Math.ceil(firstPage.total / PAGE_SIZE);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await listHeartbeatJobs("", { page, pageSize: PAGE_SIZE });
    const match = result.jobs.find(job => job.name === DAILY_RETENTION_CLEANUP_JOB_NAME);
    if (match) return match;
  }
  return undefined;
}

async function activateHeartbeatJob(taskUid: string): Promise<void> {
  await updateHeartbeatJob(taskUid, {
    cron: DAILY_RETENTION_CLEANUP_CRON,
    path: DAILY_RETENTION_CLEANUP_PATH,
    method: "POST",
    payload: {},
    description: DESCRIPTION,
    enable: true,
  }, "");
}

/** Ensure the daily 07:00 Thailand cleanup heartbeat and its authenticated DB identity exist. */
export async function ensureDailyRetentionCleanupSchedule(): Promise<{ taskUid: string; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available while setting up daily retention cleanup");

  let task = await findExistingHeartbeatJob();
  let taskUid: string;
  let created = false;

  if (task) {
    taskUid = task.taskUid;
    if (needsDailyRetentionHeartbeatUpdate(task)) await activateHeartbeatJob(taskUid);
  } else {
    try {
      const result = await createHeartbeatJob({
        name: DAILY_RETENTION_CLEANUP_JOB_NAME,
        cron: DAILY_RETENTION_CLEANUP_CRON,
        path: DAILY_RETENTION_CLEANUP_PATH,
        method: "POST",
        payload: {},
        description: DESCRIPTION,
      }, "");
      taskUid = result.taskUid;
      created = true;
    } catch (createError) {
      task = await findExistingHeartbeatJob();
      if (!task) throw createError;
      taskUid = task.taskUid;
      if (needsDailyRetentionHeartbeatUpdate(task)) await activateHeartbeatJob(taskUid);
    }
  }

  await db.insert(appMessageCleanupJobs).values({
    jobKey: DAILY_RETENTION_CLEANUP_JOB_KEY,
    scheduleCronTaskUid: taskUid,
    lastRunAt: null,
  }).onDuplicateKeyUpdate({
    set: {
      scheduleCronTaskUid: taskUid,
    },
  });

  return { taskUid, created };
}
