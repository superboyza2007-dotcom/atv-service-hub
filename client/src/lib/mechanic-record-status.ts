export type MechanicAlertStatusRecord = { vehicleNumber: number };
export type MechanicRepairStatusRecord = { vehicleNumber: number; status: "กำลังซ่อม" | "แจ้งรับรถ" | "เสร็จแล้ว"; updatedAt?: string };
export type DerivedMechanicRecordStatus = "inspection" | "repair" | "pickup" | "ready";

/** Alerts are safety guidance only; they never change the vehicle's operational status. */
export function resolveMechanicRecordVehicleStatus(
  vehicleNumber: number,
  _alerts: MechanicAlertStatusRecord[],
  repairs: MechanicRepairStatusRecord[],
): DerivedMechanicRecordStatus {
  const vehicleRepairs = repairs.filter(repair => repair.vehicleNumber === vehicleNumber);
  // The newest repair decision is authoritative. Older open records are
  // historical data and must not keep a vehicle locked after a newer
  // no-pickup completion.
  const newest = vehicleRepairs
    .filter(repair => typeof repair.updatedAt === "string")
    .sort((left, right) => Date.parse(right.updatedAt!) - Date.parse(left.updatedAt!))[0];
  if (newest) {
    if (newest.status === "กำลังซ่อม") return "repair";
    if (newest.status === "แจ้งรับรถ") return "pickup";
    return "ready";
  }
  // Preserve deterministic behavior for legacy records without timestamps.
  if (vehicleRepairs.some(repair => repair.status === "กำลังซ่อม")) return "repair";
  if (vehicleRepairs.some(repair => repair.status === "แจ้งรับรถ")) return "pickup";
  return "ready";
}
