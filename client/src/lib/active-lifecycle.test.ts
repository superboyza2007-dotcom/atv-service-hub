import { describe, expect, it } from "vitest";
import { deriveVehicleStatusesFromActive } from "./active-vehicle-status";

describe("Active lifecycle", () => {
  it("sets listed vehicles to active and returns them to ready when the Active item ends", () => {
    const vehicles = [
      { id: "12", status: "ready" },
      { id: "17", status: "ready" },
      { id: "39", status: "repair" },
    ];
    const activeVehicles = deriveVehicleStatusesFromActive(vehicles, ["12", "17"]);
    expect(activeVehicles).toEqual([
      { id: "12", status: "active" },
      { id: "17", status: "active" },
      { id: "39", status: "repair" },
    ]);

    const completedVehicles = deriveVehicleStatusesFromActive(activeVehicles, []);

    expect(completedVehicles.map(vehicle => vehicle.status)).toEqual(["ready", "ready", "repair"]);
  });
});
