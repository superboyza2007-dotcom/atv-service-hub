import { describe, expect, it } from "vitest";
import { closeGuideRepairReport, extractGuideVehicleNumber, findGuideRepairReportForRepair, guideRepairVehicleSelection, GUIDE_REPAIR_SCREEN, isGuideRepairReportCompleted, isGuideRepairReportPending, markGuideRepairReportInProgress, mergeGuideRepairReports, normalizeGuideRepairReports, pendingGuideRepairReports, pendingGuideRepairVehicleNumbers } from "./mechanic-guide-repair";

describe("mechanic guide repair reports", () => {
  it("keeps valid guide reports and rejects incomplete records", () => {
    expect(normalizeGuideRepairReports([
      { id: "repair-1", vehicleId: "m3-v12", description: "ตรวจเบรก", reporter: "บอย", createdAt: "2026-08-25T10:00:00.000Z", status: "แจ้งซ่อม" },
      { id: "repair-2", vehicleId: "m3-v17", description: "", reporter: "นก", createdAt: "2026-08-25T10:01:00.000Z", status: "แจ้งซ่อม" },
    ])).toHaveLength(1);
  });

  it("extracts the vehicle number from the guide vehicle id", () => {
    expect(extractGuideVehicleNumber("m3-v12")).toBe(12);
    expect(extractGuideVehicleNumber("unknown")).toBeUndefined();
  });

  it("uses the shared repair screen for guide reports", () => {
    expect(GUIDE_REPAIR_SCREEN).toBe("repair");
  });

  it("converts a guide report vehicle id into the mechanic form value", () => {
    expect(guideRepairVehicleSelection("m3-v38")).toBe("38");
    expect(guideRepairVehicleSelection("unknown")).toBe("");
  });

  it("finds and closes the original guide report when the mechanic finishes it", () => {
    const report = { id: "repair-38", vehicleId: "m3-v38", description: "ยางรั่ว", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    const source = findGuideRepairReportForRepair([report], { vehicleNumber: 38, createdAt: "2026-08-26T06:01:00.000Z" });
    expect(source?.id).toBe("repair-38");
    expect(closeGuideRepairReport([report], source!.id, "2026-08-26T06:02:00.000Z", "ผู้ดูแลและพัฒนาระบบ")[0]).toMatchObject({ status: "ซ่อมเสร็จ", completedBy: "ผู้ดูแลและพัฒนาระบบ" });
  });

  it("closes the guide queue for both pickup decisions after mechanic submission", () => {
    const report = { id: "repair-24", vehicleId: "m3-v24", description: "ตรวจโซ่", reporter: "ไกด์", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    for (const decision of ["แจ้งรับรถ", "ไม่แจ้งรับรถ"] as const) {
      const completed = closeGuideRepairReport([report], report.id, "2026-08-26T06:02:00.000Z", `ช่าง · ${decision}`);
      expect(completed[0]).toMatchObject({ status: "ซ่อมเสร็จ", completedBy: `ช่าง · ${decision}` });
    }
  });

  it("keeps the source report in progress until Google export succeeds", () => {
    const report = { id: "repair-38", vehicleId: "m3-v38", description: "ยางรั่ว", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    expect(markGuideRepairReportInProgress([report], report.id)[0]).toMatchObject({ status: "กำลังซ่อม" });
    expect(markGuideRepairReportInProgress([report], report.id)[0].completedAt).toBeUndefined();
  });

  it("treats a usable waiting-parts report as ready instead of repair", () => {
    const report = { id: "repair-2", vehicleId: "m3-v2", description: "รออะไหล่แต่ยังใช้งานได้", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "รออะไหล่ใช้งานได้" };
    expect(isGuideRepairReportPending(report, [])).toBe(false);
    expect(pendingGuideRepairVehicleNumbers([report], [])).not.toContain(2);
  });

  it("does not reopen a completed guide report from a stale open snapshot", () => {
    const completed = { id: "repair-17", vehicleId: "m3-v17", description: "ตรวจเบรก", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "ซ่อมเสร็จ", completedAt: "2026-08-26T06:05:00.000Z", completedBy: "ช่างเอ" };
    const staleOpen = { ...completed, status: "กำลังซ่อม", completedAt: undefined, completedBy: undefined };
    expect(mergeGuideRepairReports([completed], [staleOpen])[0]).toMatchObject({ status: "ซ่อมเสร็จ", completedBy: "ช่างเอ" });
  });

  it("marks a guide report as completed by its linked repair record", () => {
    const report = { id: "repair-38", vehicleId: "m3-v38", description: "ยางรั่ว", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    expect(isGuideRepairReportCompleted(report, { sourceGuideRepairId: "repair-38", vehicleNumber: 38, createdAt: "2026-08-26T06:01:00.000Z" })).toBe(true);
    expect(isGuideRepairReportCompleted(report, { vehicleNumber: 38, createdAt: "2026-08-26T06:01:00.000Z" })).toBe(true);
    expect(isGuideRepairReportCompleted(report, { vehicleNumber: 12, createdAt: "2026-08-26T06:01:00.000Z" })).toBe(false);
  });

  it("does not treat an earlier repair as completion of a guide report", () => {
    const report = { id: "repair-38", vehicleId: "m3-v38", description: "ยางรั่ว", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    expect(isGuideRepairReportCompleted(report, { vehicleNumber: 38, createdAt: "2026-08-26T05:59:00.000Z" })).toBe(false);
  });

  it("shares only pending reports with the Mechanic card and Database reader", () => {
    const open = { id: "repair-12", vehicleId: "m3-v12", description: "ตรวจเบรก", reporter: "ไกด์", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    const completed = { id: "repair-24", vehicleId: "m3-v24", description: "ตรวจโซ่", reporter: "ไกด์", createdAt: "2026-08-26T06:00:00.000Z", status: "ซ่อมเสร็จ" };
    const reports = [open, completed];
    const completion = [{ sourceGuideRepairId: completed.id, vehicleNumber: 24, createdAt: "2026-08-26T06:01:00.000Z" }];
    expect(pendingGuideRepairReports(reports, completion)).toEqual([open]);
    expect(pendingGuideRepairVehicleNumbers(reports, completion)).toEqual(new Set([12]));
  });

  it("keeps new reports pending for the mechanic priority indicator until a repair is started", () => {
    const report = { id: "repair-17", vehicleId: "m3-v17", description: "ตรวจเบรก", reporter: "บอย", createdAt: "2026-08-26T06:00:00.000Z", status: "แจ้งซ่อม" };
    expect(isGuideRepairReportPending(report, [])).toBe(true);
    expect(isGuideRepairReportPending(report, [{ sourceGuideRepairId: "repair-17", vehicleNumber: 17, createdAt: "2026-08-26T06:01:00.000Z" }])).toBe(false);
  });
});
