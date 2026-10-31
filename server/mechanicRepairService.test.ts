import { describe, expect, it } from "vitest";
import { normalizeLegacyMechanicRepair } from "./mechanicRepairService";

describe("legacy mechanic repair import normalization", () => {
  const now = new Date("2026-10-31T00:00:00.000Z");

  it("preserves valid legacy values and normalizes timestamps", () => {
    const record = normalizeLegacyMechanicRepair({
      id: "RP-legacy-1",
      vehicleNumber: 47,
      symptom: "  ตรวจเบรก  ",
      parts: "ผ้าเบรก",
      technician: "ช่างเอ",
      decision: "แจ้งรับรถ",
      status: "แจ้งรับรถ",
      createdAt: "2026-10-30T10:00:00.000Z",
      updatedAt: "2026-10-30T11:00:00.000Z",
      sourceGuideRepairId: "guide-1",
      accumulatedHoursAtRepair: 125.5,
    }, now);

    expect(record).toMatchObject({
      id: "RP-legacy-1",
      vehicleNumber: 47,
      symptom: "ตรวจเบรก",
      parts: "ผ้าเบรก",
      technician: "ช่างเอ",
      decision: "แจ้งรับรถ",
      status: "แจ้งรับรถ",
      sourceGuideRepairId: "guide-1",
      accumulatedHoursAtRepair: 125.5,
      exportedAt: null,
      archivedAt: null,
    });
    expect(record?.createdAt).toEqual(new Date("2026-10-30T10:00:00.000Z"));
    expect(record?.updatedAt).toEqual(new Date("2026-10-30T11:00:00.000Z"));
  });

  it("rejects malformed records and uses safe fallbacks for optional legacy fields", () => {
    expect(normalizeLegacyMechanicRepair({ id: "", vehicleNumber: 47, symptom: "x", technician: "ช่าง", status: "เสร็จแล้ว" }, now)).toBeUndefined();
    const record = normalizeLegacyMechanicRepair({
      id: "RP-legacy-2",
      vehicleNumber: 12,
      symptom: "ตรวจยาง",
      technician: "ช่างบี",
      status: "เสร็จแล้ว",
      createdAt: "invalid",
      decision: "unknown",
    }, now);
    expect(record).toMatchObject({
      createdAt: now,
      updatedAt: now,
      parts: "",
      decision: null,
      accumulatedHoursAtRepair: null,
      sourceGuideRepairId: null,
    });
  });
});
