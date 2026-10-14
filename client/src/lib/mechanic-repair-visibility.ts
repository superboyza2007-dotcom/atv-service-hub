export type RepairVisibilityRecord = {
  status: string;
  decision?: string;
};

/** Completed pickup jobs leave the active worklist but remain in the repair archive. */
export function filterActiveMechanicRepairs<T extends RepairVisibilityRecord>(repairs: T[]): T[] {
  return repairs.filter(repair => repair.status !== "แจ้งรับรถ" && repair.status !== "เสร็จแล้ว" && repair.decision !== "แจ้งรับรถ");
}

export function getMechanicRepairLog<T>(repairs: T[]): T[] {
  return repairs;
}
