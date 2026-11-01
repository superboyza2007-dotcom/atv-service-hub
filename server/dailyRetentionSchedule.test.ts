import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  createHeartbeatJob: vi.fn(),
  listHeartbeatJobs: vi.fn(),
  updateHeartbeatJob: vi.fn(),
  values: vi.fn(),
  onDuplicateKeyUpdate: vi.fn(),
}));

vi.mock("./db", () => ({ getDb: mocks.getDb }));
vi.mock("./_core/heartbeat", () => ({
  createHeartbeatJob: mocks.createHeartbeatJob,
  listHeartbeatJobs: mocks.listHeartbeatJobs,
  updateHeartbeatJob: mocks.updateHeartbeatJob,
}));

import {
  DAILY_RETENTION_CLEANUP_CRON,
  DAILY_RETENTION_CLEANUP_JOB_KEY,
  DAILY_RETENTION_CLEANUP_JOB_NAME,
  DAILY_RETENTION_CLEANUP_PATH,
  ensureDailyRetentionCleanupSchedule,
  needsDailyRetentionHeartbeatUpdate,
} from "./dailyRetentionSchedule";

describe("daily retention cleanup schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDb.mockResolvedValue({
      insert: vi.fn(() => ({ values: mocks.values })),
    });
    mocks.values.mockReturnValue({ onDuplicateKeyUpdate: mocks.onDuplicateKeyUpdate });
    mocks.onDuplicateKeyUpdate.mockResolvedValue(undefined);
    mocks.listHeartbeatJobs.mockResolvedValue({ total: 0, actorUserId: "owner", jobs: [] });
  });

  it("creates the 07:00 Thailand heartbeat and persists its task identity", async () => {
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "task-daily" });

    await expect(ensureDailyRetentionCleanupSchedule()).resolves.toEqual({ taskUid: "task-daily", created: true });

    expect(mocks.createHeartbeatJob).toHaveBeenCalledWith(expect.objectContaining({
      name: DAILY_RETENTION_CLEANUP_JOB_NAME,
      cron: DAILY_RETENTION_CLEANUP_CRON,
      path: DAILY_RETENTION_CLEANUP_PATH,
      method: "POST",
    }), "");
    expect(mocks.values).toHaveBeenCalledWith({
      jobKey: DAILY_RETENTION_CLEANUP_JOB_KEY,
      scheduleCronTaskUid: "task-daily",
      lastRunAt: null,
    });
    expect(mocks.onDuplicateKeyUpdate).toHaveBeenCalledWith({
      set: { scheduleCronTaskUid: "task-daily" },
    });
  });

  it("repairs a disabled or stale existing heartbeat", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 1,
      actorUserId: "owner",
      jobs: [{
        taskUid: "task-disabled",
        name: DAILY_RETENTION_CLEANUP_JOB_NAME,
        cronExpression: DAILY_RETENTION_CLEANUP_CRON,
        callbackPath: DAILY_RETENTION_CLEANUP_PATH,
        callbackMethod: "POST",
        callbackPayload: "{}",
        isEnable: false,
        userId: "owner",
        description: "",
      }],
    });

    await expect(ensureDailyRetentionCleanupSchedule()).resolves.toEqual({ taskUid: "task-disabled", created: false });
    expect(mocks.updateHeartbeatJob).toHaveBeenCalledWith("task-disabled", expect.objectContaining({ enable: true }), "");
  });

  it("recognizes the expected active configuration", () => {
    expect(needsDailyRetentionHeartbeatUpdate(undefined)).toBe(true);
    expect(needsDailyRetentionHeartbeatUpdate({
      cronExpression: DAILY_RETENTION_CLEANUP_CRON,
      callbackPath: DAILY_RETENTION_CLEANUP_PATH,
      callbackMethod: "POST",
      isEnable: true,
    })).toBe(false);
    expect(needsDailyRetentionHeartbeatUpdate({
      cronExpression: "0 * * * * *",
      callbackPath: DAILY_RETENTION_CLEANUP_PATH,
      callbackMethod: "POST",
      isEnable: true,
    })).toBe(true);
  });
});
