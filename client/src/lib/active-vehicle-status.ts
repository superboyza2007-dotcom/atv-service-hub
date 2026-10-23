export type ActiveVehicleRecord = { id: string; status: string };

export function deriveVehicleStatusesFromActive<T extends ActiveVehicleRecord>(vehicles: T[], activeVehicleIds: string[]): T[] {
  const active = new Set(activeVehicleIds);
  return vehicles.map(vehicle => {
    if (active.has(vehicle.id)) return { ...vehicle, status: "active" };
    if (vehicle.status === "active") return { ...vehicle, status: "ready" };
    return vehicle;
  });
}
