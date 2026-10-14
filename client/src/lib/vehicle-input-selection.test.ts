import { describe, expect, it } from "vitest";
import { selectableVehiclesForGuideInput, type GuideInputVehicle } from "./vehicle-input-selection";

describe("Guide page 2.1 vehicle selection", () => {
  it("hides repair and pickup vehicles but keeps unassigned vehicles selectable", () => {
    const vehicles: Array<GuideInputVehicle & { number: number; unassigned?: boolean }> = [
      { number: 12, status: "ready", unassigned: true },
      { number: 17, status: "repair" },
      { number: 24, status: "pickup" },
      { number: 25, status: "active" },
      { number: 26, status: "inspection" },
    ];

    expect(selectableVehiclesForGuideInput(vehicles).map(vehicle => vehicle.number)).toEqual([12, 26]);
    expect(selectableVehiclesForGuideInput(vehicles).some(vehicle => vehicle.number === 12 && vehicle.unassigned)).toBe(true);
  });
});
