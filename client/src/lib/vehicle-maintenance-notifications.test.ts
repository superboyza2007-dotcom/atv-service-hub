import { describe, expect, it } from "vitest";
import { hasVehicleMaintenanceNotification, type VehicleMaintenanceNotification } from "./vehicle-maintenance-notifications";

const notification = (ruleId: string, vehicleNumber: number, status: VehicleMaintenanceNotification["status"] = "รอตรวจสอบ"): VehicleMaintenanceNotification => ({
  id: `${ruleId}-${vehicleNumber}`,
  ruleId,
  ruleName: "น้ำมันเครื่อง",
  vehicleNumber,
  cc: "200",
  accumulatedHours: 10,
  thresholdHours: 50,
  message: "กรุณานำรถมาเปลี่ยนตามรายการ",
  mechanic: "ช่าง",
  recipients: [{ id: 10, name: "ไกด์" }],
  createdAt: "2026-09-23T00:00:00.000Z",
  status,
});

describe("vehicle maintenance notification sent state", () => {
  it("matches the selected rule and vehicle even before the threshold is due", () => {
    expect(hasVehicleMaintenanceNotification([notification("oil", 12)], "oil", 12)).toBe(true);
    expect(hasVehicleMaintenanceNotification([notification("oil", 12)], "oil", 13)).toBe(false);
    expect(hasVehicleMaintenanceNotification([notification("oil", 12)], "brake", 12)).toBe(false);
  });

  it("allows the mechanic to send again after the guide acknowledges it", () => {
    expect(hasVehicleMaintenanceNotification([notification("oil", 12, "รับทราบแล้ว")], "oil", 12)).toBe(false);
  });
});
