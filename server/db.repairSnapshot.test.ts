import { describe, expect, it } from "vitest";
import { mergeGuideRepairSnapshotPayload, reconcileFleetSnapshotFromMechanicState } from "./db";

describe("Guide repair snapshot persistence", () => {
  const completed = {
    id: "guide-1",
    vehicleId: "m3-v12",
    description: "ตรวจเบรก",
    reporter: "ไกด์",
    createdAt: "2026-09-21T01:00:00.000Z",
    status: "ซ่อมเสร็จ",
    completedAt: "2026-09-21T02:00:00.000Z",
    completedBy: "ช่าง A",
  };

  it("does not let a stale open repair report reopen a completed report", () => {
    const staleOpen = { ...completed, status: "กำลังซ่อม", completedAt: undefined, completedBy: undefined };
    const merged = mergeGuideRepairSnapshotPayload(
      "atv-guide-sessions-v1",
      { repairReports: [completed] },
      { repairReports: [staleOpen] },
    );
    expect(merged.repairReports).toEqual([completed]);
  });

  it("keeps terminal reports when a stale patch omits them", () => {
    const merged = mergeGuideRepairSnapshotPayload(
      "atv-guide-state-v1",
      { repairReports: [completed] },
      { repairReports: [] },
    );
    expect(merged.repairReports).toEqual([completed]);
  });

  it("leaves unrelated snapshot keys unchanged", () => {
    const staleOpen = { ...completed, status: "กำลังซ่อม", completedAt: undefined, completedBy: undefined };
    const merged = mergeGuideRepairSnapshotPayload(
      "atv-mechanic-state-v1",
      { repairReports: [completed] },
      { repairReports: [staleOpen] },
    );
    expect(merged.repairReports).toEqual([staleOpen]);
  });
});


describe("Mechanic-to-fleet status reconciliation", () => {
  it("returns a vehicle to ready when newest repair is completed", () => {
    const fleet = { vehicleState: { vehicleGroups: [{ numbers: [47], unavailable: [47], pickup: [], inUse: [] }] } };
    const mechanic = { repairs: [
      { vehicleNumber: 47, status: "กำลังซ่อม", updatedAt: "2026-10-03T16:49:41.855Z" },
      { vehicleNumber: 47, status: "เสร็จแล้ว", updatedAt: "2026-10-03T19:22:03.374Z" },
    ] };
    expect(reconcileFleetSnapshotFromMechanicState(fleet, mechanic).vehicleState.vehicleGroups[0]).toMatchObject({ numbers: [47], unavailable: [], pickup: [], inUse: [] });
  });
});
