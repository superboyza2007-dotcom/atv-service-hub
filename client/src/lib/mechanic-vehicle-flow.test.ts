import { describe, expect, it } from "vitest";
import { applyMechanicVehicleStatus, getMechanicVehicleStatus } from "./mechanic-vehicle-flow";

const state = {
  version: 1 as const,
  updatedAt: 0,
  vehicleGroups: [{ cc: "200cc", label: "200 ซีซี", numbers: [12, 17], unavailable: [17], notifications: [], inUse: [] }],
  responsibilityGroups: [],
};

describe("mechanic vehicle flow", () => {
  it("keeps a vehicle ready for an alert and moves repairs to pickup", () => {
    const alerted = applyMechanicVehicleStatus(state, [12], "inspection");
    expect(getMechanicVehicleStatus(alerted.vehicleGroups[0]!, 12)).toBe("ready");

    const repairing = applyMechanicVehicleStatus({ ...state, ...alerted, version: 1, updatedAt: 0 }, [12], "repair");
    expect(getMechanicVehicleStatus(repairing.vehicleGroups[0]!, 12)).toBe("repair");

    const pickup = applyMechanicVehicleStatus({ ...state, ...repairing, version: 1, updatedAt: 0 }, [12], "pickup");
    expect(getMechanicVehicleStatus(pickup.vehicleGroups[0]!, 12)).toBe("pickup");
  });

  it("returns a received pickup vehicle to ready without changing other repairs", () => {
    const pickupState = applyMechanicVehicleStatus(state, [12], "pickup");
    const ready = applyMechanicVehicleStatus({ ...state, ...pickupState, version: 1, updatedAt: 0 }, [12], "ready");
    expect(getMechanicVehicleStatus(ready.vehicleGroups[0]!, 12)).toBe("ready");
    expect(getMechanicVehicleStatus(ready.vehicleGroups[0]!, 17)).toBe("repair");
  });
});
