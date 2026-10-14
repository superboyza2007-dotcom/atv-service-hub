import { describe, expect, it } from "vitest";
import {
  isBlockedFromNewVehicleSelection,
  isSelectableForNewRepair,
  isSelectableForNewSession,
  isVehicleOperationallyReadyStatus,
  openRepairVehicleNumbers,
} from "./vehicle-selection-rules";

describe("vehicle selection rules", () => {
  it("blocks repair, pickup, and active vehicles from new operational selection", () => {
    expect(isBlockedFromNewVehicleSelection("repair")).toBe(true);
    expect(isBlockedFromNewVehicleSelection("pickup")).toBe(true);
    expect(isBlockedFromNewVehicleSelection("active")).toBe(true);
    expect(isBlockedFromNewVehicleSelection("ready")).toBe(false);
    expect(isVehicleOperationallyReadyStatus("ready")).toBe(true);
    expect(isVehicleOperationallyReadyStatus("inspection")).toBe(true);
    expect(isVehicleOperationallyReadyStatus("repair")).toBe(false);
  });

  it("allows only ready vehicles that are not reserved by a session for 2.1", () => {
    const busy = new Set([17]);
    expect(isSelectableForNewSession({ status: "ready" }, busy, 12)).toBe(true);
    expect(isSelectableForNewSession({ status: "inspection" }, busy, 13)).toBe(true);
    expect(isSelectableForNewSession({ status: "ready" }, busy, 17)).toBe(false);
    expect(isSelectableForNewSession({ status: "repair" }, busy, 24)).toBe(false);
    expect(isSelectableForNewSession({ status: "pickup" }, busy, 25)).toBe(false);
  });

  it("derives open report vehicle numbers without blocking the mechanic repair workflow", () => {
    const open = openRepairVehicleNumbers([
      { vehicleId: "m3-v12", status: "แจ้งซ่อม" },
      { vehicleId: "m3-v24", status: "ซ่อมเสร็จ" },
      { vehicleId: "m3-v25", status: "แจ้งซ่อม", completedAt: "2026-08-28T01:00:00.000Z" },
    ]);
    expect(Array.from(open)).toEqual([12]);
    expect(isSelectableForNewRepair({ number: 12, status: "ready" }, new Set())).toBe(true);
    expect(isSelectableForNewRepair({ number: 26, status: "ready" }, new Set())).toBe(true);
    expect(isSelectableForNewRepair({ number: 27, status: "inspection" }, new Set())).toBe(true);
    expect(isSelectableForNewRepair({ number: 39, status: "repair" }, new Set())).toBe(true);
    expect(isSelectableForNewRepair({ number: 46, status: "pickup" }, new Set())).toBe(true);
    expect(isSelectableForNewRepair({ number: 54, status: "active" }, new Set())).toBe(false);
    expect(isSelectableForNewRepair({ number: 59, status: "ready" }, new Set(["m3-v59"]))).toBe(false);
  });

  it("keeps the current vehicle available only while editing its existing repair record", () => {
    const open = new Set([12]);
    expect(isSelectableForNewRepair({ number: 12, status: "repair" }, new Set(), 12)).toBe(true);
    expect(isSelectableForNewRepair({ number: 24, status: "ready" }, new Set(), 12)).toBe(true);
  });
});
