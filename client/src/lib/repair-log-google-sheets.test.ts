import { describe, expect, it } from "vitest";
import { buildRepairLogSheetPayload, isGoogleAppsScriptWebAppUrl, isSuccessfulRepairLogResponse, repairLogSheetRowValues } from "./repair-log-google-sheets";

describe("repair log Google Sheets export", () => {
  it("keeps every repair detail in the configured column order", () => {
    expect(repairLogSheetRowValues({ id: "r1", kind: "repair", vehicleNumber: 12, description: "เปลี่ยนน้ำมันเครื่อง", parts: "น้ำมันเครื่อง", reporter: "ช่าง A", createdAt: "2026-09-21T01:00:00.000Z", updatedAt: "2026-09-21T02:00:00.000Z", status: "ซ่อมเสร็จ", decision: "แจ้งรับรถ", sourceGuideRepairId: "guide-1", accumulatedHoursAtRepair: 2.5, totalHours: "1.0 ชม." })).toEqual(["r1", "2026-09-21T01:00:00.000Z", "2026-09-21T02:00:00.000Z", "1.0 ชม.", 12, "เปลี่ยนน้ำมันเครื่อง", "น้ำมันเครื่อง", "ช่าง A", 2.5, "ซ่อมเสร็จ", "แจ้งรับรถ", "guide-1", "รายการซ่อม"]);
  });

  it("builds one batch payload without dropping rows", () => {
    const payload = buildRepairLogSheetPayload([
      { id: "r1", kind: "repair", vehicleNumber: 12, description: "อาการ 1", reporter: "ช่าง A", createdAt: "2026-09-21T01:00:00.000Z", updatedAt: "2026-09-21T01:30:00.000Z", status: "กำลังซ่อม", decision: "ไม่แจ้งรับรถ", accumulatedHoursAtRepair: 1 },
      { id: "r2", kind: "repair", vehicleNumber: 13, description: "อาการ 2", reporter: "ช่าง B", createdAt: "2026-09-21T02:00:00.000Z", status: "กำลังซ่อม" },
    ], "2026-09-21T03:00:00.000Z");
    expect(payload.rows).toHaveLength(2);
    expect(payload.columns).toContain("ชั่วโมงสะสม");
    expect(payload.sentAt).toBe("2026-09-21T03:00:00.000Z");
  });

  it("accepts only Apps Script Web App execution URLs", () => {
    expect(isGoogleAppsScriptWebAppUrl("https://script.google.com/macros/s/abc123/exec")).toBe(true);
    expect(isGoogleAppsScriptWebAppUrl("https://docs.google.com/spreadsheets/d/abc/edit")).toBe(false);
    expect(isGoogleAppsScriptWebAppUrl("http://script.google.com/macros/s/abc123/exec")).toBe(false);
  });

  it("requires an explicit successful response before clearing local repair logs", () => {
    expect(isSuccessfulRepairLogResponse({ ok: true })).toBe(true);
    expect(isSuccessfulRepairLogResponse({ ok: false })).toBe(false);
    expect(isSuccessfulRepairLogResponse({})).toBe(false);
    expect(isSuccessfulRepairLogResponse(null)).toBe(false);
  });
});
