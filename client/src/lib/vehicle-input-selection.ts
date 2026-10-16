import { isBlockedFromNewVehicleSelection } from "./vehicle-selection-rules";

export type GuideInputVehicleStatus = "ready" | "repair" | "inspection" | "pickup" | "active";

export type GuideInputVehicle = {
  status: GuideInputVehicleStatus;
};

/**
 * Page 2.1 can show vehicles that are not in a repair or pickup workflow.
 * Responsibility grouping is deliberately not part of this filter: unassigned
 * vehicles remain selectable until a session reserves them.
 */
export function selectableVehiclesForGuideInput<T extends GuideInputVehicle>(vehicles: T[]): T[] {
  return vehicles.filter(vehicle => !isBlockedFromNewVehicleSelection(vehicle.status));
}
