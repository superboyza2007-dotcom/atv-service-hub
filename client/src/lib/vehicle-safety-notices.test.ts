import { describe, expect, it } from "vitest";
import { groupVehicleSafetyNotices, normalizeVehicleSafetyNotices, noticesForVehicle, removeVehicleSafetyNotice, upsertVehicleSafetyNotice, type VehicleSafetyNotice } from "./vehicle-safety-notices";

const notice = (id: string, vehicleNumber: number): VehicleSafetyNotice => ({
  id,
  vehicleNumber,
  description: `คำแนะนำรถ ${vehicleNumber}`,
  severity: "ปกติ",
  reporter: "ช่างเอ",
  createdAt: `2026-08-26T0${id === "a" ? "8" : "9"}:00:00.000Z`,
});

describe("vehicle safety notices", () => {

  it("normalizes only valid guidance records", () => {
    expect(normalizeVehicleSafetyNotices([notice("a", 12), { id: "bad", vehicleNumber: 12 }])).toEqual([notice("a", 12)]);
  });

  it("upserts and removes guidance without any vehicle status field", () => {
    const first = notice("a", 12);
    const updated = { ...first, description: "ตรวจเบรกก่อนออกงาน" };
    expect(upsertVehicleSafetyNotice([], first)).toEqual([first]);
    expect(upsertVehicleSafetyNotice([first], updated)).toEqual([updated]);
    expect(removeVehicleSafetyNotice([updated, notice("b", 17)], "a")).toEqual([notice("b", 17)]);
    expect("status" in updated).toBe(false);
  });

  it("returns guidance only for the requested vehicle", () => {
    const records = [notice("a", 12), notice("b", 17), notice("c", 12)];
    expect(noticesForVehicle(records, 12).map(item => item.id)).toEqual(["c", "a"]);
    expect(noticesForVehicle(records, 99)).toEqual([]);
  });

  it("keeps every guidance item for one vehicle so the ! indicator can open the full list", () => {
    const records = [notice("a", 12), notice("b", 12), notice("c", 17)];
    const vehicleNotices = noticesForVehicle(records, 12);
    expect(vehicleNotices).toHaveLength(2);
    expect(vehicleNotices.every(item => item.vehicleNumber === 12)).toBe(true);
  });

  it("groups only vehicles in the Active detail and removes duplicate vehicle ids", () => {
    const records = [notice("a", 12), notice("b", 17), notice("c", 99)];
    expect(groupVehicleSafetyNotices(records, [12, 12, 17]).map(group => ({ number: group.vehicleNumber, ids: group.notices.map(item => item.id) }))).toEqual([
      { number: 12, ids: ["a"] },
      { number: 17, ids: ["b"] },
    ]);
  });
});
