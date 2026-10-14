import { isVehicleOperationallyReadyStatus } from "./vehicle-selection-rules";

export type FleetCc = "200" | "250";
export type FleetStatus = "ready" | "repair" | "inspection" | "pickup" | "active";

export type FleetVehicle = {
  cc: FleetCc;
  status: FleetStatus;
};

/** Counts only vehicles that belong to the requested engine-size fleet. Guidance may overlap with ready. */
export function summarizeFleetStatus<T extends FleetVehicle>(vehicles: T[], cc: FleetCc) {
  const fleet = vehicles.filter(vehicle => vehicle.cc === cc);
  return {
    ready: fleet.filter(vehicle => isVehicleOperationallyReadyStatus(vehicle.status)).length,
    repair: fleet.filter(vehicle => vehicle.status === "repair").length,
    alert: fleet.filter(vehicle => vehicle.status === "inspection").length,
    pickup: fleet.filter(vehicle => vehicle.status === "pickup").length,
    active: fleet.filter(vehicle => vehicle.status === "active").length,
    total: fleet.length,
  };
}
