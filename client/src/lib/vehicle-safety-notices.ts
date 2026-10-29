export type VehicleSafetyNotice = {
  id: string;
  source?: "manual" | "waiting-available";
  sourceRepairReportId?: string;
  vehicleNumber: number;
  description: string;
  severity: "ปกติ" | "เร่งด่วน";
  reporter: string;
  createdAt: string;
  updatedAt?: string;
  waitingParts?: boolean;
  waitingPartDetail?: string;
};

const isNotice = (value: unknown): value is VehicleSafetyNotice => {
  if (!value || typeof value !== "object") return false;
  const notice = value as Partial<VehicleSafetyNotice>;
  return typeof notice.id === "string"
    && typeof notice.vehicleNumber === "number"
    && Number.isInteger(notice.vehicleNumber)
    && notice.vehicleNumber > 0
    && typeof notice.description === "string"
    && typeof notice.reporter === "string"
    && typeof notice.createdAt === "string"
    && (notice.severity === "ปกติ" || notice.severity === "เร่งด่วน");
};

export function normalizeVehicleSafetyNotices(value: unknown): VehicleSafetyNotice[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isNotice).map(notice => ({ ...notice, description: notice.description.trim() })).filter(notice => notice.description.length > 0);
}

export function upsertVehicleSafetyNotice(notices: VehicleSafetyNotice[], notice: VehicleSafetyNotice): VehicleSafetyNotice[] {
  const existing = notices.some(item => item.id === notice.id);
  return existing ? notices.map(item => item.id === notice.id ? notice : item) : [notice, ...notices];
}

export function removeVehicleSafetyNotice(notices: VehicleSafetyNotice[], noticeId: string): VehicleSafetyNotice[] {
  return notices.filter(notice => notice.id !== noticeId);
}

export type VehicleSafetyNoticeRepairReport = { id: string; status?: string; completedAt?: string };

/** Waiting-parts notices are valid only while their originating repair report is open. */
export function removeOrphanedVehicleSafetyNotices(notices: VehicleSafetyNotice[], reports: VehicleSafetyNoticeRepairReport[]): VehicleSafetyNotice[] {
  const reportsById = new Map(reports.map(report => [report.id, report]));
  return notices.filter(notice => {
    if (!notice.sourceRepairReportId) return true;
    const report = reportsById.get(notice.sourceRepairReportId);
    return Boolean(report) && report?.status !== "ซ่อมเสร็จ" && !report?.completedAt;
  });
}

export function noticesForVehicle(notices: VehicleSafetyNotice[], vehicleNumber: number): VehicleSafetyNotice[] {
  return notices.filter(notice => notice.vehicleNumber === vehicleNumber).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type VehicleSafetyNoticeGroup = { vehicleNumber: number; notices: VehicleSafetyNotice[] };

export function groupVehicleSafetyNotices(notices: VehicleSafetyNotice[], vehicleNumbers: number[]): VehicleSafetyNoticeGroup[] {
  return Array.from(new Set(vehicleNumbers))
    .map(vehicleNumber => ({ vehicleNumber, notices: noticesForVehicle(notices, vehicleNumber) }))
    .filter(group => group.notices.length > 0);
}
