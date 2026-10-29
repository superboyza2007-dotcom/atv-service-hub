import { vehicleFlowSchedules } from "../drizzle/schema";
import { getDb } from "./db";
import {
  createHeartbeatJob,
  listHeartbeatJobs,
  updateHeartbeatJob,
  type HeartbeatJobInfo,
} from "./_core/heartbeat";

export const VEHICLE_FLOW_RECONCILIATION_JOB_KEY = "expired-session-reconciliation";
export const VEHICLE_FLOW_RECONCILIATION_JOB_NAME = "atv-expired-session-reconciliation";
export const VEHICLE_FLOW_RECONCILIATION_CRON = "0 * * * * *";
export const VEHICLE_FLOW_RECONCILIATION_PATH = "/api/scheduled/reconcile-vehicle-sessions";
const PAGE_SIZE = 200;
const DESCRIPTION = "จบรายการ Active ที่เลือกจบอัตโนมัติและคืนรถเมื่อหมดเวลา";

type HeartbeatJobShape = Pick<HeartbeatJobInfo, "cronExpression" | "callbackPath" | "callbackMethod" | "isEnable">;

export function needsVehicleFlowHeartbeatUpdate(job: HeartbeatJobShape | undefined): boolean {
  return !job
    || job.cronExpression !== VEHICLE_FLOW_RECONCILIATION_CRON
    || job.callbackPath !== VEHICLE_FLOW_RECONCILIATION_PATH
    || job.callbackMethod !== "POST"
    || !job.isEnable;
}

async function findExistingHeartbeatJob(): Promise<HeartbeatJobInfo | undefined> {
  const firstPage = await listHeartbeatJobs("", { page: 1, pageSize: PAGE_SIZE });
  const firstMatch = firstPage.jobs.find(job => job.name === VEHICLE_FLOW_RECONCILIATION_JOB_NAME);
  if (firstMatch) return firstMatch;

  const pageCount = Math.ceil(firstPage.total / PAGE_SIZE);
  for (let page = 2; page <= pageCount; page += 1) {
    const result = await listHeartbeatJobs("", { page, pageSize: PAGE_SIZE });
    const match = result.jobs.find(job => job.name === VEHICLE_FLOW_RECONCILIATION_JOB_NAME);
    if (match) return match;
  }
  return undefined;
}

async function activateHeartbeatJob(taskUid: string): Promise<void> {
  await updateHeartbeatJob(taskUid, {
    cron: VEHICLE_FLOW_RECONCILIATION_CRON,
    path: VEHICLE_FLOW_RECONCILIATION_PATH,
    method: "POST",
    payload: {},
    description: DESCRIPTION,
    enable: true,
  }, "");
}

/**
 * Ensure the production callback has an active one-minute heartbeat and persist
 * its authenticated task identity so the callback can reject unrelated jobs.
 */
export async function ensureVehicleFlowReconciliationSchedule(): Promise<{ taskUid: string; created: boolean }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available while setting up vehicle-session reconciliation");

  let task = await findExistingHeartbeatJob();
  let taskUid: string;
  let created = false;

  if (task) {
    taskUid = task.taskUid;
    if (needsVehicleFlowHeartbeatUpdate(task)) await activateHeartbeatJob(taskUid);
  } else {
    try {
      const result = await createHeartbeatJob({
        name: VEHICLE_FLOW_RECONCILIATION_JOB_NAME,
        cron: VEHICLE_FLOW_RECONCILIATION_CRON,
        path: VEHICLE_FLOW_RECONCILIATION_PATH,
        method: "POST",
        payload: {},
        description: DESCRIPTION,
      }, "");
      taskUid = result.taskUid;
      created = true;
    } catch (createError) {
      // Another app instance may have created the project-scoped job at the same time.
      task = await findExistingHeartbeatJob();
      if (!task) throw createError;
      taskUid = task.taskUid;
      if (needsVehicleFlowHeartbeatUpdate(task)) await activateHeartbeatJob(taskUid);
    }
  }

  await db.insert(vehicleFlowSchedules).values({
    jobKey: VEHICLE_FLOW_RECONCILIATION_JOB_KEY,
    scheduleCronTaskUid: taskUid,
    cronExpression: VEHICLE_FLOW_RECONCILIATION_CRON,
    isEnabled: 1,
  }).onDuplicateKeyUpdate({
    set: {
      scheduleCronTaskUid: taskUid,
      cronExpression: VEHICLE_FLOW_RECONCILIATION_CRON,
      isEnabled: 1,
    },
  });

  return { taskUid, created };
}
