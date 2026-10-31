import { describe, expect, it, vi } from "vitest";
import {
  buildRepairLogSheetPayload,
  isRepairLogSheetConfigured,
  parseAllowedAppsScriptUrl,
  repairLogPayloadSchema,
  submitRepairLogSheetPayload,
  type RepairLogPayload,
} from "./repairLogGoogleSheets";

const endpoint = "https://script.google.com/macros/s/test-deployment/exec";
const columns = [
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
];
const payload: RepairLogPayload = {
  source: "guide-module-dashboard",
  sheetName: "RepairLog",
  columns,
  rows: [["repair-1", "2026-09-28T00:00:00.000Z", "", "", 12, "รายละเอียด", "", "ช่าง", 1.5, "ซ่อมเสร็จ", "", "guide-1", "รายการซ่อม"]],
  sentAt: "2026-09-28T00:00:00.000Z",
};

describe("server-side Google Apps Script repair-log proxy", () => {
  it("builds the Sheets payload directly from canonical repair records", () => {
    const generated = buildRepairLogSheetPayload([{
      id: "RP-db-1",
      vehicleNumber: 12,
      symptom: "ตรวจเบรก",
      parts: "ผ้าเบรก",
      technician: "ช่างเอ",
      decision: "แจ้งรับรถ",
      status: "แจ้งรับรถ",
      createdAt: "2026-09-28T00:00:00.000Z",
      updatedAt: "2026-09-28T02:00:00.000Z",
      sourceGuideRepairId: "guide-1",
      accumulatedHoursAtRepair: 1.5,
    }], new Date("2026-09-28T03:00:00.000Z"));

    expect(generated.columns).toEqual(columns);
    expect(generated.rows).toEqual([[
      "RP-db-1", "2026-09-28T00:00:00.000Z", "2026-09-28T02:00:00.000Z", "2.0 ชม.", 12,
      "ตรวจเบรก", "ผ้าเบรก", "ช่างเอ", 1.5, "แจ้งรับรถ", "แจ้งรับรถ", "guide-1", "รายการซ่อม",
    ]]);
    expect(generated.sentAt).toBe("2026-09-28T03:00:00.000Z");
  });

  it("requires the exact RepairLog 13-column contract", () => {
    expect(repairLogPayloadSchema.safeParse(payload).success).toBe(true);
    expect(repairLogPayloadSchema.safeParse({ ...payload, columns: ["รายการ"] }).success).toBe(false);
    expect(repairLogPayloadSchema.safeParse({ ...payload, rows: [["repair-1"]] }).success).toBe(false);
    expect(repairLogPayloadSchema.safeParse({ ...payload, rows: [] }).success).toBe(false);
  });

  it("accepts only HTTPS Apps Script web-app endpoints", () => {
    expect(parseAllowedAppsScriptUrl(endpoint)?.hostname).toBe("script.google.com");
    expect(parseAllowedAppsScriptUrl(`${endpoint}?channel=repair`)).not.toBeNull();
    expect(parseAllowedAppsScriptUrl("http://script.google.com/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://example.com/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://script.google.com.evil.test/macros/s/id/exec")).toBeNull();
    expect(parseAllowedAppsScriptUrl("https://script.google.com:8443/macros/s/id/exec")).toBeNull();
    expect(isRepairLogSheetConfigured("")).toBe(false);
  });

  it("validates the configured production Apps Script endpoint without exposing it", () => {
    expect(isRepairLogSheetConfigured(endpoint)).toBe(true);
    expect(isRepairLogSheetConfigured("")).toBe(false);
  });

  it("posts the payload and follows only Google's Apps Script content redirect", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 302,
        headers: { location: "https://script.googleusercontent.com/macros/echo?key=test" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }));

    await expect(submitRepairLogSheetPayload(payload, endpoint, fetchImpl as typeof fetch)).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe("POST");
    expect(fetchImpl.mock.calls[1]?.[1]?.method).toBe("GET");
  });

  it("rejects redirects to untrusted hosts without making a second request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "https://attacker.example/collect" },
    }));

    await expect(submitRepairLogSheetPayload(payload, endpoint, fetchImpl as typeof fetch)).rejects.toThrow("untrusted redirect");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fails closed when no server endpoint has been configured", async () => {
    const fetchImpl = vi.fn();
    await expect(submitRepairLogSheetPayload(payload, "", fetchImpl as typeof fetch)).rejects.toThrow("not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
