export type SessionVehicleHistory = {
  vehicleId: string;
  number: string;
  cc: "200" | "250";
  addedAt: string;
  removedAt?: string;
};

type VehicleSummary = { id: string; number: string; cc: "200" | "250" };
type SessionVehicleSource = { vehicleIds: string[]; vehicleHistory?: SessionVehicleHistory[]; activityLog?: Array<{ action: string; detail?: string; createdAt: string }> };

export function buildVehicleHistory(vehicles: VehicleSummary[], vehicleIds: string[], addedAt: string): SessionVehicleHistory[] {
  return vehicleIds.flatMap(vehicleId => {
    const vehicle = vehicles.find(item => item.id === vehicleId);
    return vehicle ? [{ vehicleId: vehicle.id, number: vehicle.number, cc: vehicle.cc, addedAt }] : [];
  });
}

export function addVehicleToHistory(history: SessionVehicleHistory[] | undefined, vehicle: VehicleSummary, addedAt: string): SessionVehicleHistory[] {
  const existing = history?.find(item => item.vehicleId === vehicle.id);
  if (existing) return history!.map(item => item.vehicleId === vehicle.id ? { ...item, number: vehicle.number, cc: vehicle.cc, removedAt: undefined } : item);
  return [...(history ?? []), { vehicleId: vehicle.id, number: vehicle.number, cc: vehicle.cc, addedAt }];
}

export function removeVehicleFromHistory(history: SessionVehicleHistory[] | undefined, vehicleId: string, removedAt: string): SessionVehicleHistory[] {
  return (history ?? []).map(item => item.vehicleId === vehicleId ? { ...item, removedAt } : item);
}

export function vehicleHistoryOrFallback(session: SessionVehicleSource, vehicles: VehicleSummary[], fallbackAt = ""): SessionVehicleHistory[] {
  if (session.vehicleHistory?.length) return session.vehicleHistory;
  const recovered = new Map<string, SessionVehicleHistory>();
  for (const activity of session.activityLog ?? []) {
    const numbers = activity.detail?.match(/#([0-9]+)/g)?.map(value => value.slice(1)) ?? [];
    for (const number of numbers) {
      const vehicle = vehicles.find(item => item.number === number);
      if (!vehicle) continue;
      const existing = recovered.get(vehicle.id);
      const removed = activity.action.includes("นำรถออก") || activity.action.includes("เปลี่ยนรถ") ? activity.createdAt : existing?.removedAt;
      recovered.set(vehicle.id, { vehicleId: vehicle.id, number: vehicle.number, cc: vehicle.cc, addedAt: existing?.addedAt ?? activity.createdAt, removedAt: removed });
    }
  }
  for (const vehicle of buildVehicleHistory(vehicles, session.vehicleIds, fallbackAt)) {
    const existing = recovered.get(vehicle.vehicleId);
    recovered.set(vehicle.vehicleId, { ...vehicle, ...existing, removedAt: undefined });
  }
  return recovered.size ? Array.from(recovered.values()) : buildVehicleHistory(vehicles, session.vehicleIds, fallbackAt);
}

export function reconcileVehicleHistory(session: SessionVehicleSource & { sessionId?: string; createdAt?: string }, vehicles: VehicleSummary[], nextVehicleIds: string[], changedAt: string): SessionVehicleHistory[] {
  let history = vehicleHistoryOrFallback(session, vehicles, session.createdAt ?? changedAt);
  const nextIds = new Set(nextVehicleIds);
  for (const vehicleId of nextVehicleIds) {
    const vehicle = vehicles.find(item => item.id === vehicleId);
    if (vehicle) history = addVehicleToHistory(history, vehicle, changedAt);
  }
  for (const item of history) {
    if (!nextIds.has(item.vehicleId) && !item.removedAt) history = removeVehicleFromHistory(history, item.vehicleId, changedAt);
  }
  return history;
}

export function sortVehicleHistory(history: SessionVehicleHistory[]): SessionVehicleHistory[] {
  return [...history].sort((a, b) => {
    const ccOrder = a.cc.localeCompare(b.cc);
    if (ccOrder !== 0) return ccOrder;
    return Number(a.number) - Number(b.number);
  });
}
