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
  ensureVehicleFlowReconciliationSchedule,
  needsVehicleFlowHeartbeatUpdate,
  VEHICLE_FLOW_RECONCILIATION_CRON,
  VEHICLE_FLOW_RECONCILIATION_JOB_KEY,
  VEHICLE_FLOW_RECONCILIATION_JOB_NAME,
  VEHICLE_FLOW_RECONCILIATION_PATH,
} from "./vehicleFlowSchedule";

describe("vehicle-flow reconciliation schedule", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getDb.mockResolvedValue({
      insert: vi.fn(() => ({
        values: mocks.values,
      })),
    });
    mocks.values.mockReturnValue({ onDuplicateKeyUpdate: mocks.onDuplicateKeyUpdate });
    mocks.onDuplicateKeyUpdate.mockResolvedValue(undefined);
    mocks.listHeartbeatJobs.mockResolvedValue({ total: 0, actorUserId: "owner", jobs: [] });
  });

  it("creates and persists the project heartbeat when it does not exist", async () => {
    mocks.createHeartbeatJob.mockResolvedValue({ taskUid: "task-123" });

    await expect(ensureVehicleFlowReconciliationSchedule()).resolves.toEqual({ taskUid: "task-123", created: true });

    expect(mocks.createHeartbeatJob).toHaveBeenCalledWith(expect.objectContaining({
      name: VEHICLE_FLOW_RECONCILIATION_JOB_NAME,
      cron: VEHICLE_FLOW_RECONCILIATION_CRON,
      path: VEHICLE_FLOW_RECONCILIATION_PATH,
      method: "POST",
    }), "");
    expect(mocks.updateHeartbeatJob).not.toHaveBeenCalled();
    expect(mocks.values).toHaveBeenCalledWith({
      jobKey: VEHICLE_FLOW_RECONCILIATION_JOB_KEY,
      scheduleCronTaskUid: "task-123",
      cronExpression: VEHICLE_FLOW_RECONCILIATION_CRON,
      isEnabled: 1,
    });
    expect(mocks.onDuplicateKeyUpdate).toHaveBeenCalledWith({ set: expect.objectContaining({ scheduleCronTaskUid: "task-123", isEnabled: 1 }) });
  });

  it("repairs and enables a matching existing heartbeat that was disabled", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 1,
      actorUserId: "owner",
      jobs: [{
        taskUid: "task-disabled",
        name: VEHICLE_FLOW_RECONCILIATION_JOB_NAME,
        cronExpression: VEHICLE_FLOW_RECONCILIATION_CRON,
        callbackPath: VEHICLE_FLOW_RECONCILIATION_PATH,
        callbackMethod: "POST",
        callbackPayload: "{}",
        isEnable: false,
        userId: "owner",
        description: "",
      }],
    });

    await expect(ensureVehicleFlowReconciliationSchedule()).resolves.toEqual({ taskUid: "task-disabled", created: false });

    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
    expect(mocks.updateHeartbeatJob).toHaveBeenCalledWith("task-disabled", expect.objectContaining({ enable: true }), "");
  });

  it("does not update a heartbeat that already has the expected active configuration", async () => {
    mocks.listHeartbeatJobs.mockResolvedValue({
      total: 1,
      actorUserId: "owner",
      jobs: [{
        taskUid: "task-ready",
        name: VEHICLE_FLOW_RECONCILIATION_JOB_NAME,
        cronExpression: VEHICLE_FLOW_RECONCILIATION_CRON,
        callbackPath: VEHICLE_FLOW_RECONCILIATION_PATH,
        callbackMethod: "POST",
        callbackPayload: "{}",
        isEnable: true,
        userId: "owner",
        description: "",
      }],
    });

    await expect(ensureVehicleFlowReconciliationSchedule()).resolves.toEqual({ taskUid: "task-ready", created: false });

    expect(mocks.createHeartbeatJob).not.toHaveBeenCalled();
    expect(mocks.updateHeartbeatJob).not.toHaveBeenCalled();
  });

  it("detects stale, disabled, or mismatched callback configuration", () => {
    expect(needsVehicleFlowHeartbeatUpdate(undefined)).toBe(true);
    expect(needsVehicleFlowHeartbeatUpdate({ cronExpression: "0 * * * * *", callbackPath: "/api/scheduled/reconcile-vehicle-sessions", callbackMethod: "POST", isEnable: false })).toBe(true);
    expect(needsVehicleFlowHeartbeatUpdate({ cronExpression: "0 * * * * *", callbackPath: "/api/scheduled/reconcile-vehicle-sessions", callbackMethod: "POST", isEnable: true })).toBe(false);
  });
});
