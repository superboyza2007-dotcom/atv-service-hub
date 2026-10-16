import { extractGuideVehicleNumber } from "./mechanic-guide-repair";

export type GuideRepairLike = { vehicleId: string; status?: string; completedAt?: string };
export type MechanicRepairLike = { vehicleNumber: number; status?: string };
export type PendingPickupLike = { vehicleNumber: number; status?: string };
export type ReconciledVehicleStatus = "repair" | "pickup";

/**
 * Derives only unresolved external workflow states. A completed Guide report is
 * ignored, and a pending pickup request wins over a repair state because it is
 * the next permitted hand-off in the workflow.
 */
export function deriveOperationalStatusOverrides(
  guideReports: GuideRepairLike[],
  mechanicRepairs: MechanicRepairLike[],
  pickupRequests: PendingPickupLike[],
): Map<number, ReconciledVehicleStatus> {
  const overrides = new Map<number, ReconciledVehicleStatus>();

  mechanicRepairs.forEach(repair => {
    if (repair.status === "กำลังซ่อม" && Number.isInteger(repair.vehicleNumber) && repair.vehicleNumber > 0) {
      overrides.set(repair.vehicleNumber, "repair");
    }
  });

  guideReports.forEach(report => {
    if (report.status === "ซ่อมเสร็จ" || report.completedAt) return;
    const number = extractGuideVehicleNumber(report.vehicleId);
    if (number !== undefined && !overrides.has(number)) overrides.set(number, "repair");
  });

  pickupRequests.forEach(request => {
    if (request.status !== "รอรับรถ" || !Number.isInteger(request.vehicleNumber) || request.vehicleNumber <= 0) return;
    overrides.set(request.vehicleNumber, "pickup");
  });

  return overrides;
}
