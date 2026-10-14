import { getVehicleStatus, setVehicleStatusForNumbers, type VehicleGroupRecord, type VehicleResponsibilityState, type VehicleStatus } from "./vehicle-responsibility-store";

export type MechanicVehicleStatus = VehicleStatus;

export function getMechanicVehicleStatus(group: VehicleGroupRecord, number: number): MechanicVehicleStatus {
  return getVehicleStatus(number, [group]);
}

export function applyMechanicVehicleStatus(
  state: VehicleResponsibilityState,
  vehicleNumbers: number[],
  status: "inspection" | "repair" | "pickup" | "ready",
): Omit<VehicleResponsibilityState, "version" | "updatedAt"> {
  return setVehicleStatusForNumbers(state, vehicleNumbers, status);
}
