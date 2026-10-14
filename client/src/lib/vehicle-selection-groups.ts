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
