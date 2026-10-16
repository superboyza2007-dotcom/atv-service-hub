import { describe, expect, it } from "vitest";
import { resolveMechanicRecordVehicleStatus } from "./mechanic-record-status";

describe("resolveMechanicRecordVehicleStatus", () => {
  it("keeps the vehicle ready when an alert is the only remaining record", () => {
    expect(resolveMechanicRecordVehicleStatus(12, [{ vehicleNumber: 12 }], [])).toBe("ready");
  });

  it("keeps pickup when an alert is removed but a completed repair remains", () => {
    expect(resolveMechanicRecordVehicleStatus(12, [], [{ vehicleNumber: 12, status: "แจ้งรับรถ" }])).toBe("pickup");
  });

  it("prioritizes an active repair ahead of a completed repair while ignoring alert guidance", () => {
    expect(resolveMechanicRecordVehicleStatus(12, [{ vehicleNumber: 12 }], [{ vehicleNumber: 12, status: "แจ้งรับรถ" }, { vehicleNumber: 12, status: "กำลังซ่อม" }])).toBe("repair");
  });

  it("returns ready after every related record is removed", () => {
    expect(resolveMechanicRecordVehicleStatus(12, [], [])).toBe("ready");
  });
});

  it("ignores records belonging to another vehicle", () => {
    expect(resolveMechanicRecordVehicleStatus(12, [{ vehicleNumber: 17 }], [{ vehicleNumber: 17, status: "แจ้งรับรถ" }])).toBe("ready");
  });

  it("keeps the status helper deterministic without external configuration", () => {
    expect(resolveMechanicRecordVehicleStatus(99, [], [])).toBe("ready");
  });

describe("latest repair wins", () => {
  it("returns ready when the newest repair is completed despite stale older repairs", () => {
    expect(resolveMechanicRecordVehicleStatus(47, [], [
      { vehicleNumber: 47, status: "เสร็จแล้ว", updatedAt: "2026-10-03T19:22:03.374Z" },
      { vehicleNumber: 47, status: "กำลังซ่อม", updatedAt: "2026-10-03T16:49:41.855Z" },
    ])).toBe("ready");
  });
});
