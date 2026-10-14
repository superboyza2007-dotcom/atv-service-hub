export const GUIDE_REPAIR_REPORTS_UPDATED_EVENT = "atv-guide-repair-reports-updated";
export const GUIDE_REPAIR_SCREEN = "repair" as const;
export const GUIDE_APP_SHARED_STATE_STORAGE = "atv-guide-app-shared-v1";
export const GUIDE_APP_STATE_UPDATED_EVENT = "atv-guide-app-state-updated";

export type GuideRepairReport = {
  id: string;
  vehicleId: string;
  description: string;
  reporter: string;
  createdAt: string;
  status: string;
  completedAt?: string;
  completedBy?: string;
};

export function normalizeGuideRepairReports(value: unknown): GuideRepairReport[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is GuideRepairReport => {
    if (!item || typeof item !== "object") return false;
    const report = item as Partial<GuideRepairReport>;
    return typeof report.id === "string"
      && typeof report.vehicleId === "string"
      && typeof report.description === "string"
      && report.description.trim().length > 0
      && typeof report.reporter === "string"
      && typeof report.createdAt === "string"
      && typeof report.status === "string";
  });
}

export function closeGuideRepairReport(
  reports: GuideRepairReport[],
  sourceReportId: string,
  completedAt: string,
  completedBy: string,
): GuideRepairReport[] {
  return reports.map(report => report.id === sourceReportId
    ? { ...report, status: "ซ่อมเสร็จ", completedAt, completedBy }
    : report);
}

export function markGuideRepairReportInProgress(
  reports: GuideRepairReport[],
  sourceReportId: string,
): GuideRepairReport[] {
  return reports.map(report => report.id === sourceReportId
    && report.status !== "ซ่อมเสร็จ"
    && !report.completedAt
    ? { ...report, status: "กำลังซ่อม", completedAt: undefined, completedBy: undefined }
    : report);
}

export function reopenGuideRepairReport(
  reports: GuideRepairReport[],
  sourceReportId: string,
): GuideRepairReport[] {
  return reports.map(report => report.id === sourceReportId
    ? { ...report, status: "กำลังซ่อม", completedAt: undefined, completedBy: undefined }
    : report);
}

export function mergeGuideRepairReports(local: GuideRepairReport[], remote: GuideRepairReport[]): GuideRepairReport[] {
  const byId = new Map(local.map(report => [report.id, report]));
  remote.forEach(report => {
    const current = byId.get(report.id);
    // A completed report is terminal. Never let an older open snapshot reopen it.
    if (!current || report.status === "ซ่อมเสร็จ" || current.status !== "ซ่อมเสร็จ") byId.set(report.id, report);
  });
  return Array.from(byId.values());
}

export function findGuideRepairReportForRepair(
  reports: GuideRepairReport[],
  repair: { sourceGuideRepairId?: string; vehicleNumber: number; createdAt: string },
): GuideRepairReport | undefined {
  if (repair.sourceGuideRepairId) return reports.find(report => report.id === repair.sourceGuideRepairId);
  const repairTime = new Date(repair.createdAt).getTime();
  return reports
    .filter(report => report.status !== "ซ่อมเสร็จ" && extractGuideVehicleNumber(report.vehicleId) === repair.vehicleNumber)
    .filter(report => Number.isFinite(repairTime) && Number.isFinite(new Date(report.createdAt).getTime()) && new Date(report.createdAt).getTime() <= repairTime)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
}


export function extractGuideVehicleNumber(vehicleId: string): number | undefined {
  const match = vehicleId.match(/(\d+)$/);
  if (!match) return undefined;
  const number = Number(match[1]);
  return Number.isFinite(number) ? number : undefined;
}

export function guideRepairVehicleSelection(vehicleId: string): string {
  const number = extractGuideVehicleNumber(vehicleId);
  return number === undefined ? "" : String(number);
}

export type GuideRepairCompletionRecord = {
  sourceGuideRepairId?: string;
  vehicleNumber: number;
  createdAt: string;
};

export function isGuideRepairReportCompleted(
  report: GuideRepairReport,
  repair: GuideRepairCompletionRecord,
): boolean {
  if (report.status === "ซ่อมเสร็จ") return true;
  if (repair.sourceGuideRepairId) return repair.sourceGuideRepairId === report.id;
  const reportVehicleNumber = extractGuideVehicleNumber(report.vehicleId);
  if (reportVehicleNumber === undefined || repair.vehicleNumber !== reportVehicleNumber) return false;
  const reportTime = new Date(report.createdAt).getTime();
  const repairTime = new Date(repair.createdAt).getTime();
  return Number.isFinite(reportTime) && Number.isFinite(repairTime) && repairTime >= reportTime;
}

export function isGuideRepairReportPending(report: GuideRepairReport, repairs: GuideRepairCompletionRecord[]): boolean {
  return !repairs.some(repair => isGuideRepairReportCompleted(report, repair));
}

export function pendingGuideRepairReports(
  reports: GuideRepairReport[],
  repairs: GuideRepairCompletionRecord[],
): GuideRepairReport[] {
  return reports.filter(report => isGuideRepairReportPending(report, repairs));
}

export function pendingGuideRepairVehicleNumbers(
  reports: GuideRepairReport[],
  repairs: GuideRepairCompletionRecord[],
): Set<number> {
  return new Set(pendingGuideRepairReports(reports, repairs)
    .map(report => extractGuideVehicleNumber(report.vehicleId))
    .filter((number): number is number => number !== undefined));
}
