import { describe, expect, it } from "vitest";
import { groupVehicleOptionsByResponsibility } from "./vehicle-selection-groups";

const groups = [
  { id: "south", name: "ฝูงใต้", vehicleNumbers: [17, 25], managers: [2], color: "#3b82f6" },
  { id: "north", name: "ฝูงเหนือ", vehicleNumbers: [12], managers: [1], color: "#22c55e" },
];

describe("groupVehicleOptionsByResponsibility", () => {
  it("groups vehicle tiles in configured group order and leaves unassigned vehicles visible last", () => {
    const vehicles = [
      { number: "25", cc: "200" },
      { number: "38", cc: "250" },
      { number: "12", cc: "250" },
      { number: "17", cc: "200" },
    ];

    const result = groupVehicleOptionsByResponsibility(vehicles, groups);

    expect(result.map(group => ({ label: group.label, color: group.color, numbers: group.vehicles.map(vehicle => Number(vehicle.number)) }))).toEqual([
      { label: "ฝูงใต้ (south)", color: "#3b82f6", numbers: [25, 17] },
      { label: "ฝูงเหนือ (north)", color: "#22c55e", numbers: [12] },
      { label: "ยังไม่มีกลุ่ม", color: "#81e597", numbers: [38] },
    ]);
  });

  it("returns no group sections when there are no selectable vehicles", () => {
    expect(groupVehicleOptionsByResponsibility([], groups)).toEqual([]);
  });
});
