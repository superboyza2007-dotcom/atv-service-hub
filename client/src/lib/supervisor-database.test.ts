import { describe, expect, it } from "vitest";
import {
  addSupervisorFleetGroup,
  addSupervisorVehicle,
  availableVehiclesForFleetGroup,
  updateSupervisorFleetGroup,
  type SupervisorFleetGroup,
  type SupervisorVehicleRecord,
} from "./supervisor-database";

describe("supervisor database rules", () => {
  const vehicles: SupervisorVehicleRecord[] = [{ number: 12, cc: "200" }];
  const groups: SupervisorFleetGroup[] = [{ id: "g1", name: "ฝูงเหนือ", vehicleNumbers: [12], managerIds: [1], color: "#81e597" }];

  it("adds a vehicle and rejects duplicate numbers", () => {
    expect(addSupervisorVehicle(vehicles, "38", "250")).toEqual({ records: [{ number: 12, cc: "200" }, { number: 38, cc: "250" }], error: "" });
    expect(addSupervisorVehicle(vehicles, "12", "200").error).toBe("เบอร์รถนี้มีอยู่แล้วในฐานข้อมูล");
  });

  it("rejects duplicate group names and overlapping vehicles", () => {
    expect(addSupervisorFleetGroup(groups, "ฝูงเหนือ", [24], [2], "g2").error).toBe("ชื่อกลุ่มนี้มีอยู่แล้ว");
    expect(addSupervisorFleetGroup(groups, "ฝูงใต้", [12], [2], "g2").error).toBe("เบอร์รถที่เลือกมีอยู่ในกลุ่มอื่นแล้ว");
  });

  it("allows creating the first fleet group from an unassigned vehicle", () => {
    const result = addSupervisorFleetGroup([], "ฝูงใหม่", [12], [1], "g1", "#42a5f5");
    expect(result.error).toBe("");
    expect(result.groups[0]).toMatchObject({ name: "ฝูงใหม่", vehicleNumbers: [12], managerIds: [1], color: "#42a5f5" });
  });

  it("returns unassigned vehicles for a new group and keeps current-group vehicles while editing", () => {
    const records: SupervisorVehicleRecord[] = [{ number: 12, cc: "200" }, { number: 17, cc: "200" }, { number: 38, cc: "250" }];
    const existingGroups: SupervisorFleetGroup[] = [{ id: "g1", name: "ฝูงเหนือ", vehicleNumbers: [12], managerIds: [1] }];
    expect(availableVehiclesForFleetGroup(records, existingGroups).map(vehicle => vehicle.number)).toEqual([17, 38]);
    expect(availableVehiclesForFleetGroup(records, existingGroups, "g1").map(vehicle => vehicle.number)).toEqual([12, 17, 38]);
  });

  it("limits managers, normalizes selected values, and preserves the group color", () => {
    expect(addSupervisorFleetGroup(groups, "ฝูงใต้", [46, 38, 46], [2, 3, 4], "g2", "#ff8a65").error).toBe("เลือกผู้รับผิดชอบได้ไม่เกิน 2 คน");
    const result = addSupervisorFleetGroup(groups, "ฝูงใต้", [46, 38, 46], [2, 3], "g2", "#ff8a65");
    expect(result.error).toBe("");
    expect(result.groups[1]).toEqual({ id: "g2", name: "ฝูงใต้", vehicleNumbers: [38, 46], managerIds: [2, 3], color: "#ff8a65" });
  });

  it("updates a group name, members, vehicles, and color without overlapping another group", () => {
    const result = updateSupervisorFleetGroup(groups, "g1", "ฝูงตะวันออก", [24, 25], [2, 3], "#42a5f5");
    expect(result.error).toBe("");
    expect(result.groups).toEqual([{ id: "g1", name: "ฝูงตะวันออก", vehicleNumbers: [24, 25], managerIds: [2, 3], color: "#42a5f5" }]);
    expect(updateSupervisorFleetGroup(groups, "missing", "ฝูงใหม่", [38], [2], "#fff").error).toBe("ไม่พบกลุ่มที่ต้องการแก้ไข");
  });
});
