import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";

export type NumberedVehicle = { number: string | number; cc: string };
export type VehicleSelectionGroup<T extends NumberedVehicle> = {
  key: string;
  label: string;
  color: string;
  vehicles: T[];
};

/** Group selector options by the canonical fleet mapping; unassigned vehicles stay visible last. */
export function groupVehicleOptionsByResponsibility<T extends NumberedVehicle>(
  vehicles: T[],
  responsibilityGroups: ResponsibilityGroupRecord[],
): VehicleSelectionGroup<T>[] {
  const groups = new Map<string, VehicleSelectionGroup<T> & { order: number }>();

  vehicles.forEach(vehicle => {
    const number = Number(vehicle.number);
    const order = responsibilityGroups.findIndex(group => group.vehicleNumbers.includes(number));
    const responsibility = order >= 0 ? responsibilityGroups[order] : undefined;
    const key = responsibility ? `group-${String(responsibility.id)}` : "unassigned";
    const current = groups.get(key) ?? {
      key,
      label: responsibility
        ? responsibility.name ? `${responsibility.name} (${responsibility.id})` : `กลุ่ม ${responsibility.id}`
        : "ยังไม่มีกลุ่ม",
      color: responsibility?.color || "#81e597",
      vehicles: [],
      order: responsibility ? order : Number.MAX_SAFE_INTEGER,
    };
    current.vehicles.push(vehicle);
    groups.set(key, current);
  });

  return Array.from(groups.values())
    .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, "th"))
    .map(({ order: _order, ...group }) => group);
}

/**
 * Put the vehicle group owned by the primary operator/team first. The other
 * groups follow the earliest manager position found in the live queue, while
 * unassigned vehicles remain last.
 */
export function prioritizeVehicleGroupsByQueue<T extends NumberedVehicle>(
  groups: VehicleSelectionGroup<T>[],
  responsibilityGroups: ResponsibilityGroupRecord[],
  primaryMemberIds: string[],
  queueMemberIds: string[],
): VehicleSelectionGroup<T>[] {
  const queueRank = new Map(queueMemberIds.map((id, index) => [String(id), index]));
  const primaryIds = new Set(primaryMemberIds.map(id => Number(id)).filter(id => Number.isInteger(id)));
  const originalOrder = new Map(groups.map((group, index) => [group.key, index]));
  const groupMeta = new Map(responsibilityGroups.map(group => [String(group.id), group]));
  const groupRank = (group: VehicleSelectionGroup<T>) => {
    if (group.key === "unassigned") return { primary: 1, queue: Number.MAX_SAFE_INTEGER };
    const responsibility = groupMeta.get(group.key.replace(/^group-/, ""));
    if (!responsibility) return { primary: 1, queue: Number.MAX_SAFE_INTEGER };
    const primary = responsibility.managers.some(managerId => primaryIds.has(managerId)) ? 0 : 1;
    const queue = Math.min(...responsibility.managers.map(managerId => queueRank.get(String(managerId)) ?? Number.MAX_SAFE_INTEGER));
    return { primary, queue };
  };

  return [...groups].sort((left, right) => {
    const leftRank = groupRank(left);
    const rightRank = groupRank(right);
    return leftRank.primary - rightRank.primary
      || leftRank.queue - rightRank.queue
      || (originalOrder.get(left.key) ?? 0) - (originalOrder.get(right.key) ?? 0)
      || left.label.localeCompare(right.label, "th");
  });
}
