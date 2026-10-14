import { isVehicleOperationallyReadyStatus } from "./vehicle-selection-rules";

export type ReplacementSession = {
  sessionId: string;
  status: string;
  vehicleIds?: string[];
};

export type ReplacementVehicle = {
  number: number;
  status: string;
};

export function activeVehicleId(value: number | string): string {
  const raw = String(value);
  return raw.startsWith("m3-v") ? raw : `m3-v${raw}`;
}

export function availableReplacementVehicleNumbers(
  vehicles: ReplacementVehicle[],
  sessions: ReplacementSession[],
  selectedSessionId?: string,
): Set<number> {
  const busyIds = new Set(
    sessions
      .filter(session => session.status !== "Completed" && session.sessionId !== selectedSessionId)
      .flatMap(session => (session.vehicleIds ?? []).map(activeVehicleId)),
  );

  return new Set(
    vehicles
      .filter(vehicle => {
        const id = activeVehicleId(vehicle.number);
        const notBusy = !busyIds.has(id);
        const effectiveReady = isVehicleOperationallyReadyStatus(vehicle.status) || (vehicle.status === "active" && notBusy);
        return effectiveReady && notBusy;
      })
      .map(vehicle => Number(vehicle.number))
      .filter(number => Number.isInteger(number) && number > 0),
  );
}
