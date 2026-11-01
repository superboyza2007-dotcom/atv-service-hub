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
  ensureMechanicRepairExportSchedule,
  MECHANIC_REPAIR_EXPORT_CRON,
  MECHANIC_REPAIR_EXPORT_JOB_KEY,
  MECHANIC_REPAIR_EXPORT_JOB_NAME,
  MECHANIC_REPAIR_EXPORT_PATH,
  needsMechanicRepairExportHeartbeatUpdate,
  shouldRunMechanicRepairExport,
} from "./mechanicRepairExportSchedule";

describe("daily mechanic repair-log export schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDb.mockResolvedValue({ insert: vi.fn(() => ({ values: mocks.values })) });
    mocks.values.mockReturnValue({ onDuplicateKeyUpdate: mocks.onDuplicateKeyUpdate });
    mocks.onDuplicateKeyUpdate.mockResolvedValue(undefined);
    mocks.listHeartbeatJobs.mockResolvedValue({ total: 0, actorUserId: "owner", jobs: [] });
  });

  it("uses 13:00 UTC for 20:00 Thailand and persists the authenticated task id", async () => {
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "task-export" });
    await expect(ensureMechanicRepairExportSchedule()).resolves.toEqual({ taskUid: "task-export", created: true });
    expect(mocks.createHeartbeatJob).toHaveBeenCalledWith(expect.objectContaining({
      name: MECHANIC_REPAIR_EXPORT_JOB_NAME,
      cron: MECHANIC_REPAIR_EXPORT_CRON,
      path: MECHANIC_REPAIR_EXPORT_PATH,
      method: "POST",
    }), "");
    expect(mocks.values).toHaveBeenCalledWith({
      jobKey: MECHANIC_REPAIR_EXPORT_JOB_KEY,
      scheduleCronTaskUid: "task-export",
      lastRunAt: null,
      isEnabled: 1,
    });
  });

  it("repairs a disabled or outdated heartbeat", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 1,
      actorUserId: "owner",
      jobs: [{
        taskUid: "task-disabled",
        name: MECHANIC_REPAIR_EXPORT_JOB_NAME,
        cronExpression: "0 * * * * *",
        callbackPath: MECHANIC_REPAIR_EXPORT_PATH,
        callbackMethod: "POST",
        callbackPayload: "{}",
        isEnable: false,
        userId: "owner",
        description: "",
      }],
    });
    await expect(ensureMechanicRepairExportSchedule()).resolves.toEqual({ taskUid: "task-disabled", created: false });
    expect(mocks.updateHeartbeatJob).toHaveBeenCalledWith("task-disabled", expect.objectContaining({ cron: MECHANIC_REPAIR_EXPORT_CRON, enable: true }), "");
  });

  it("recognizes a valid heartbeat", () => {
    expect(needsMechanicRepairExportHeartbeatUpdate(undefined)).toBe(true);
    expect(needsMechanicRepairExportHeartbeatUpdate({
      cronExpression: MECHANIC_REPAIR_EXPORT_CRON,
      callbackPath: MECHANIC_REPAIR_EXPORT_PATH,
      callbackMethod: "POST",
      isEnable: true,
    })).toBe(false);
  });

  it("runs at most once per Bangkok calendar day", () => {
    const first = new Date("2026-11-01T13:00:00.000Z"); // 20:00 Bangkok
    expect(shouldRunMechanicRepairExport(null, first)).toBe(true);
    expect(shouldRunMechanicRepairExport(new Date("2026-11-01T12:00:00.000Z"), first)).toBe(false);
    expect(shouldRunMechanicRepairExport(new Date("2026-11-01T16:59:00.000Z"), new Date("2026-11-02T13:00:00.000Z"))).toBe(true);
  });
});
