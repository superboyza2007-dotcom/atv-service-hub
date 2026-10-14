export const REPAIR_LOG_SHEET_COLUMNS = [
  "รหัสรายการ",
  "วันที่และเวลา",
  "วันที่แก้ไข",
  "เวลาซ่อมรวม",
  "เบอร์รถ",
  "รายละเอียด",
  "อะไหล่เบิกซ่อม",
  "ชื่อช่างผู้ทำรายการ",
  "ชั่วโมงสะสม",
  "สถานะ",
  "ตัวเลือก",
  "รหัสแจ้งซ่อมจากไกด์",
  "ประเภท",
] as const;

export type RepairLogSheetRow = {
  id: string;
  kind: "repair" | "alert";
  vehicleNumber: number;
  description: string;
  parts?: string;
  reporter: string;
  createdAt: string;
  updatedAt?: string;
  status: string;
  decision?: string;
  sourceGuideRepairId?: string;
  accumulatedHoursAtRepair?: number;
  totalHours?: string;
};

export type RepairLogSheetPayload = {
  source: "guide-module-dashboard";
  sheetName: "RepairLog";
  columns: string[];
  rows: Array<Array<string | number>>;
  sentAt: string;
};

export function repairLogSheetRowValues(row: RepairLogSheetRow): Array<string | number> {
  return [
    row.id,
    row.createdAt,
    row.updatedAt || "",
    row.totalHours || "",
    row.vehicleNumber,
    row.description,
    row.parts || "",
    row.reporter,
    typeof row.accumulatedHoursAtRepair === "number" ? row.accumulatedHoursAtRepair : "",
    row.status,
    row.decision || "",
    row.sourceGuideRepairId || "",
    row.kind === "repair" ? "รายการซ่อม" : "รายการเตือน",
  ];
}

export function buildRepairLogSheetPayload(rows: RepairLogSheetRow[], sentAt = new Date().toISOString()): RepairLogSheetPayload {
  return {
    source: "guide-module-dashboard",
    sheetName: "RepairLog",
    columns: [...REPAIR_LOG_SHEET_COLUMNS],
    rows: rows.map(repairLogSheetRowValues),
    sentAt,
  };
}

export function isSuccessfulRepairLogResponse(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && (value as { ok?: unknown }).ok === true);
}

export function normalizeRepairLogSheetUrl(value: string | null | undefined): string {
  return typeof value === "string" && /^https:\/\//i.test(value.trim()) ? value.trim() : "";
}

export function isGoogleAppsScriptWebAppUrl(value: string): boolean {
  return /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec(?:\?.*)?$/i.test(value.trim());
}
