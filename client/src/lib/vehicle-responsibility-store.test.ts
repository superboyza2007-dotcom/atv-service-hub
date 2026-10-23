import { describe, expect, it } from "vitest";
import {
  getResponsibilityGroupColor,
  getUnassignedVehicleNumbers,
  getVehicleStatus,
  mergeSupervisorFleetGroups,
  reconcileActiveVehicleNumbers,
  removeManagerFromResponsibilityState,
  removeVehicleFromResponsibilityState,
  setVehicleStatusForNumbers,
  updateVehicleInResponsibilityState,
  type VehicleResponsibilityState,
} from "./vehicle-responsibility-store";

const state: VehicleResponsibilityState = {
  version: 1,
  updatedAt: 0,
  vehicleGroups: [
    { cc: "200cc", label: "200 ซีซี", numbers: [12, 17], inUse: [12], pickup: [12], unavailable: [17], notifications: [17] },
    { cc: "250cc", label: "250 ซีซี", numbers: [38] },
  ],
  responsibilityGroups: [{ id: "fleet-a", name: "ฝูง A", managers: [1001, 1002], vehicleNumbers: [12, 17], color: "#ff8a65" }],
};

describe("vehicle responsibility store", () => {
  it("uses the latest Supervisor group name, color, and managers in the shared state", () => {
    const next = mergeSupervisorFleetGroups(state, [{ id: "fleet-a", name: "กลุ่มเหนือ", managers: [1003], vehicleNumbers: [12, 17], color: "#ff00aa" }]);
    expect(next.responsibilityGroups).toEqual([{ id: "fleet-a", name: "กลุ่มเหนือ", managers: [1003], vehicleNumbers: [12, 17], color: "#ff00aa" }]);
    expect(getResponsibilityGroupColor(12, next.responsibilityGroups)).toBe("#ff00aa");
  });

  it("uses one deterministic primary status per vehicle while preserving guidance", () => {
    expect(getVehicleStatus(12, state.vehicleGroups)).toBe("active");
    const repairState = setVehicleStatusForNumbers(state, [12], "repair");
    expect(getVehicleStatus(12, repairState.vehicleGroups)).toBe("repair");
    expect(repairState.vehicleGroups[0]).toMatchObject({ inUse: [], pickup: [], unavailable: [12, 17], notifications: [17] });
    const canonicalState = setVehicleStatusForNumbers(state, [38], "ready");
    expect(canonicalState.vehicleGroups[0]).toMatchObject({ inUse: [12], pickup: [], unavailable: [17], notifications: [17] });
  });

  it("reconciles Active strictly from sessions while preserving repair and pickup flags", () => {
    const next = reconcileActiveVehicleNumbers(state, [38]);
    expect(next.vehicleGroups[0].inUse).toEqual([]);
    expect(next.vehicleGroups[0].unavailable).toEqual([17]);
    expect(next.vehicleGroups[0].pickup).toEqual([12]);
    expect(next.vehicleGroups[1].inUse).toEqual([38]);
    expect(getVehicleStatus(12, next.vehicleGroups)).toBe("pickup");
    expect(getVehicleStatus(38, next.vehicleGroups)).toBe("active");
  });

  it("returns a vehicle to ready by clearing every workflow flag", () => {
    const readyState = setVehicleStatusForNumbers(state, [12, 17], "ready");
    expect(getVehicleStatus(12, readyState.vehicleGroups)).toBe("ready");
    expect(getVehicleStatus(17, readyState.vehicleGroups)).toBe("ready");
    expect(readyState.vehicleGroups[0]).toMatchObject({ inUse: [], pickup: [], unavailable: [], notifications: [17] });
  });

  it("keeps unassigned vehicles available for fleet assignment without changing operational status", () => {
    expect(getUnassignedVehicleNumbers(state.vehicleGroups, state.responsibilityGroups)).toEqual([38]);
    expect(getVehicleStatus(38, state.vehicleGroups)).toBe("ready");
  });

  it("resolves the group color for a vehicle and falls back for unassigned vehicles", () => {
    expect(getResponsibilityGroupColor(12, state.responsibilityGroups)).toBe("#ff8a65");
    expect(getResponsibilityGroupColor(38, state.responsibilityGroups)).toBe("#81e597");
  });

  it("renames or moves a vehicle while keeping it in the responsibility group", () => {
    const next = updateVehicleInResponsibilityState(state, 12, 46, "250");
    expect(next.vehicleGroups.find(group => group.cc === "200cc")?.numbers).toEqual([17]);
    expect(next.vehicleGroups.find(group => group.cc === "250cc")?.numbers).toEqual([38, 46]);
    expect(next.responsibilityGroups[0].vehicleNumbers).toEqual([46, 17]);
  });

  it("removes deleted vehicles and users from all shared responsibility records", () => {
    const withoutVehicle = removeVehicleFromResponsibilityState(state, 12);
    expect(withoutVehicle.vehicleGroups[0].numbers).toEqual([17]);
    expect(withoutVehicle.responsibilityGroups[0].vehicleNumbers).toEqual([17]);
    const withoutManager = removeManagerFromResponsibilityState(state, 1001);
    expect(withoutManager.responsibilityGroups[0].managers).toEqual([1002]);
  });
});
