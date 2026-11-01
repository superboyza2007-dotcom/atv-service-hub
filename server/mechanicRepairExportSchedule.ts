import { mechanicRepairExportSchedules } from "../drizzle/schema";
import { getDb } from "./db";
import { createHeartbeatJob, listHeartbeatJobs, updateHeartbeatJob, type HeartbeatJobInfo } from "./_core/heartbeat";

export const MECHANIC_REPAIR_EXPORT_JOB_KEY = "daily-mechanic-repair-export";
export const MECHANIC_REPAIR_EXPORT_JOB_NAME = "atv-daily-mechanic-repair-log-export";
/** Heartbeat cron uses UTC: 13:00 UTC is 20:00 in Asia/Bangkok. */
export const MECHANIC_REPAIR_EXPORT_CRON = "0 0 13 * * *";
export const MECHANIC_REPAIR_EXPORT_PATH = "/api/scheduled/export-mechanic-repair-log";
const PAGE_SIZE = 200;
const DESCRIPTION = "ส่งรายการซ่อมที่รอส่งไป Google Sheets และลบเฉพาะแถวที่ยืนยันส่งสำเร็จ ทุกวัน 20:00 น. เวลาไทย";

type HeartbeatShape = Pick<HeartbeatJobInfo, "cronExpression" | "callbackPath" | "callbackMethod" | "isEnable">;

export function needsMechanicRepairExportHeartbeatUpdate(job: HeartbeatShape | undefined): boolean {
  return !job || job.cronExpression !== MECHANIC_REPAIR_EXPORT_CRON || job.callbackPath !== MECHANIC_REPAIR_EXPORT_PATH || job.callbackMethod !== "POST" || !job.isEnable;
}

function bangkokDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function shouldRunMechanicRepairExport(lastRunAt: Date | null | undefined, now: Date): boolean {
  return !lastRunAt || bangkokDateKey(lastRunAt) !== bangkokDateKey(now);
}

async function findExistingJob(): Promise<HeartbeatJobInfo | undefined> {
  const first = await listHeartbeatJobs("", { page: 1, pageSize: PAGE_SIZE });
  const match = first.jobs.find(job => job.name === MECHANIC_REPAIR_EXPORT_JOB_NAME);
  if (match) return match;
  for (let page = 2; page <= Math.ceil(first.total / PAGE_SIZE); page += 1) {
    const result = await listHeartbeatJobs("", { page, pageSize: PAGE_SIZE });
    const found = result.jobs.find(job => job.name === MECHANIC_REPAIR_EXPORT_JOB_NAME);
    if (found) return found;
  }
  return undefined;
}

async function activateJob(taskUid: string): Promise<void> {
  await updateHeartbeatJob(taskUid, {
    cron: MECHANIC_REPAIR_EXPORT_CRON,
    path: MECHANIC_REPAIR_EXPORT_PATH,
    method: "POST",
    payload: {},
    description: DESCRIPTION,
    enable: true,
  }, "");
}

export async function ensureMechanicRepairExportSchedule(): Promise<{ taskUid: string; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available while setting up the mechanic repair-log export");
  let task = await findExistingJob();
  let taskUid: string;
  let created = false;
  if (task) {
    taskUid = task.taskUid;
    if (needsMechanicRepairExportHeartbeatUpdate(task)) await activateJob(taskUid);
  } else {
    try {
      const result = await createHeartbeatJob({
        name: MECHANIC_REPAIR_EXPORT_JOB_NAME,
        cron: MECHANIC_REPAIR_EXPORT_CRON,
        path: MECHANIC_REPAIR_EXPORT_PATH,
        method: "POST",
        payload: {},
        description: DESCRIPTION,
      }, "");
      taskUid = result.taskUid;
      created = true;
    } catch (error) {
      task = await findExistingJob();
      if (!task) throw error;
      taskUid = task.taskUid;
      if (needsMechanicRepairExportHeartbeatUpdate(task)) await activateJob(taskUid);
    }
  }

  await db.insert(mechanicRepairExportSchedules).values({
    jobKey: MECHANIC_REPAIR_EXPORT_JOB_KEY,
    scheduleCronTaskUid: taskUid,
    lastRunAt: null,
    isEnabled: 1,
  }).onDuplicateKeyUpdate({
    set: { scheduleCronTaskUid: taskUid, isEnabled: 1 },
  });
  return { taskUid, created };
}
