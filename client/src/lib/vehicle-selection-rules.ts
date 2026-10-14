import { extractGuideVehicleNumber } from "./mechanic-guide-repair";

export type OperationalVehicleStatus = "ready" | "repair" | "inspection" | "pickup" | "active" | string;

/**
 * รถในสามสถานะนี้ถูกสงวนไว้ให้ workflow เดิมของมันเอง และห้ามนำไปสร้าง
 * รายการใหม่หรือผูกเข้าคิวอื่นซ้ำ.
 */
export function isBlockedFromNewVehicleSelection(status: OperationalVehicleStatus): boolean {
  return status === "repair" || status === "pickup" || status === "active";
}

/** Guidance is a separate label. Legacy data may expose it as inspection, but it remains operationally ready. */
export function isVehicleOperationallyReadyStatus(status: OperationalVehicleStatus): boolean {
  return status === "ready" || status === "inspection";
}

export function isSelectableForNewSession<T extends { status: OperationalVehicleStatus }>(vehicle: T, busyVehicleNumbers: Set<number>, number: number): boolean {
  return isVehicleOperationallyReadyStatus(vehicle.status) && !busyVehicleNumbers.has(number);
}

export type RepairSelectionReport = {
  vehicleId: string;
  status?: string;
  completedAt?: string;
};

export function openRepairVehicleNumbers(reports: RepairSelectionReport[]): Set<number> {
  return new Set(
    reports
      .filter(report => report.status !== "ซ่อมเสร็จ" && !report.completedAt)
      .flatMap(report => {
        const number = extractGuideVehicleNumber(report.vehicleId);
        return typeof number === "number" && Number.isInteger(number) && number > 0 ? [number] : [];
      }),
  );
}

export function isSelectableForNewRepair<T extends { number: number; status: OperationalVehicleStatus }>(
  vehicle: T,
  busyVehicleIds: Set<string>,
  editingVehicleNumber?: number,
): boolean {
  const isEditingThisVehicle = editingVehicleNumber === vehicle.number;
  // Repair/pickup means the mechanic has an existing hand-off to process; only
  // a vehicle currently in use is unavailable for the repair workflow.
  return isEditingThisVehicle
    || (vehicle.status !== "active" && !busyVehicleIds.has(`m3-v${vehicle.number}`));
}
