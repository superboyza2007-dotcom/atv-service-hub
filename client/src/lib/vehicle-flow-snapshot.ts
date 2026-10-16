import type { VehiclePickupRequest } from "@/lib/vehicle-pickup-notifications";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";

export type SharedRepairRecord = {
  id: string;
  vehicleNumber: number;
  status?: string;
  decision?: string;
  createdAt: string;
  updatedAt: string;
  sourceGuideRepairId?: string;
};

export type VehicleFlowSnapshot = {
  safetyNotices?: VehicleSafetyNotice[];
  pickupRequests?: VehiclePickupRequest[];
  repairs?: SharedRepairRecord[];
};

function timestamp(value: string | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeTimestamped<T extends { id: string }>(
  current: T[],
  incoming: T[],
  getTimestamp: (item: T) => number,
  getKey: (item: T) => string = item => item.id,
) {
  const byKey = new Map(current.map(item => [getKey(item), item]));
  incoming.forEach(item => {
    const key = getKey(item);
    const previous = byKey.get(key);
    if (!previous || getTimestamp(item) >= getTimestamp(previous)) byKey.set(key, item);
  });
  return Array.from(byKey.values()).sort((a, b) => getTimestamp(b) - getTimestamp(a));
}

export function mergeVehicleSafetyNotices(current: VehicleSafetyNotice[], incoming: VehicleSafetyNotice[]) {
  return mergeTimestamped(current, incoming, item => timestamp(item.updatedAt ?? item.createdAt));
}

export function mergeVehiclePickupRequests(current: VehiclePickupRequest[], incoming: VehiclePickupRequest[]) {
  return mergeTimestamped(
    current,
    incoming,
    item => timestamp(item.receivedAt ?? item.createdAt),
    item => item.sourceRepairId || item.id,
  );
}

export function mergeVehicleRepairs(current: SharedRepairRecord[], incoming: SharedRepairRecord[]) {
  return mergeTimestamped(current, incoming, item => timestamp(item.updatedAt || item.createdAt));
}

export function mergeVehicleFlowSnapshot(current: VehicleFlowSnapshot, incoming: VehicleFlowSnapshot): VehicleFlowSnapshot {
  return {
    safetyNotices: incoming.safetyNotices ? mergeVehicleSafetyNotices(current.safetyNotices ?? [], incoming.safetyNotices) : current.safetyNotices,
    pickupRequests: incoming.pickupRequests ? mergeVehiclePickupRequests(current.pickupRequests ?? [], incoming.pickupRequests) : current.pickupRequests,
    repairs: incoming.repairs ? mergeVehicleRepairs(current.repairs ?? [], incoming.repairs) : current.repairs,
  };
}
