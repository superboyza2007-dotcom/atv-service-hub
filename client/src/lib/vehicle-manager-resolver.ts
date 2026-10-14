import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";
import { getVehicleManagerIds, getVehicleResponsibility } from "@/lib/vehicle-responsibility-store";

export type ManagerDirectoryEntry = {
  id: string | number;
  name?: string | null;
};

export type ManagerGroupSource = {
  managers?: Array<string | number>;
  managerIds?: Array<string | number>;
};

const cleanName = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function resolveManagerNamesFromIds(
  managerIds: Array<string | number>,
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
): string[] {
  const resolved = managerIds
    .map(managerId => directoryUsers.find(user => String(user.id) === String(managerId))?.name)
    .map(cleanName)
    .filter(Boolean);
  const fallback = fallbackNames.map(cleanName).filter(Boolean);
  return Array.from(new Set(resolved.length ? resolved : fallback));
}

/**
 * Resolves the displayed managers for a vehicle from the canonical fleet-group
 * mapping and the canonical user directory. The optional fallback is only used
 * for legacy snapshots that predate manager IDs.
 */
export function resolveVehicleManagerNames(
  vehicleNumber: number,
  responsibilityGroups: ResponsibilityGroupRecord[],
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
): string[] {
  return resolveManagerNamesFromIds(getVehicleManagerIds(vehicleNumber, responsibilityGroups), directoryUsers, fallbackNames);
}

export type VehicleResponsibilityView = {
  group?: ResponsibilityGroupRecord;
  groupLabel: string;
  managerNames: string[];
  managerLabel: string;
  color: string;
};

export function resolveVehicleResponsibilityView(
  vehicleNumber: number,
  responsibilityGroups: ResponsibilityGroupRecord[],
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
  fallbackColor = "#81e597",
): VehicleResponsibilityView {
  const group = getVehicleResponsibility(vehicleNumber, responsibilityGroups);
  const managerNames = resolveVehicleManagerNames(vehicleNumber, responsibilityGroups, directoryUsers, fallbackNames);
  return {
    group,
    groupLabel: group ? (group.name ? `${group.name} (${group.id})` : `กลุ่ม ${group.id}`) : "ยังไม่มีกลุ่ม",
    managerNames,
    managerLabel: managerNames.length ? managerNames.join(" · ") : "ยังไม่ระบุผู้ดูแล",
    color: group?.color || fallbackColor,
  };
}

export function resolveGroupManagerNames(
  group: ManagerGroupSource,
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
): string[] {
  return resolveManagerNamesFromIds(group.managers ?? group.managerIds ?? [], directoryUsers, fallbackNames);
}

export function formatGroupManagerNames(
  group: ManagerGroupSource,
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
  emptyLabel = "ยังไม่ระบุผู้ดูแล",
): string {
  const names = resolveGroupManagerNames(group, directoryUsers, fallbackNames);
  return names.length ? names.join(" · ") : emptyLabel;
}

export function formatVehicleManagerNames(
  vehicleNumber: number,
  responsibilityGroups: ResponsibilityGroupRecord[],
  directoryUsers: ManagerDirectoryEntry[],
  fallbackNames: string[] = [],
  emptyLabel = "ไม่มีผู้ดูแล",
): string {
  const names = resolveVehicleManagerNames(vehicleNumber, responsibilityGroups, directoryUsers, fallbackNames);
  return names.length ? names.join(" · ") : emptyLabel;
}
