export type ScheduledTaskIdentity = {
  isCron?: boolean;
  taskUid?: string | null;
};

export function isMatchingScheduledTask(
  identity: ScheduledTaskIdentity,
  storedTaskUid: string | null | undefined,
): boolean {
  return identity.isCron === true
    && typeof identity.taskUid === "string"
    && identity.taskUid.length > 0
    && identity.taskUid === storedTaskUid;
}

export const DAILY_CLEANUP_RETRY_GUARD_MS = 20 * 60 * 60 * 1_000;

export function shouldRunDailyLiveMessageCleanup(
  lastRunAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return !lastRunAt || now.getTime() - lastRunAt.getTime() >= DAILY_CLEANUP_RETRY_GUARD_MS;
}
