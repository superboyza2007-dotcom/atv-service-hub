import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VehicleResponsibilityGroupView } from "./VehicleResponsibilityGroupView";
import { buildSupervisorUserDirectoryStatusModel } from "@/lib/supervisor-data";

const state = {
  version: 1 as const,
  updatedAt: 0,
  vehicleGroups: [
    { cc: "200cc", label: "200 ซีซี", numbers: [12, 17] },
    { cc: "250cc", label: "250 ซีซี", numbers: [38] },
  ],
  responsibilityGroups: [{ id: 1, name: "กลุ่ม A", managers: [10], vehicleNumbers: [12, 17, 38], color: "#35e887" }],
};

const vehicles = [
  { id: "12", number: 12, cc: "200" as const, status: "ready" as const },
  { id: "17", number: 17, cc: "200" as const, status: "repair" as const },
  { id: "38", number: 38, cc: "250" as const, status: "active" as const },
];

describe("VehicleResponsibilityGroupView", () => {
  it("renders the Guide-style group view for shared Mechanic and Supervisor use", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleResponsibilityGroupView, { vehicles, responsibilityState: state, directoryUsers: [{ id: 10, name: "ผู้ดูแล A" }], safetyNotices: [], onBack: vi.fn(), onSafetyNoticeOpen: vi.fn() }));
    expect(html).toContain("กลุ่มรถในความดูแล");
    expect(html).toContain("กลุ่ม A");
    expect(html).toContain("ผู้รับผิดชอบ: ผู้ดูแล A");
    expect(html).toContain("#12");
    expect(html).toContain("#38");
    expect(html).toContain("พร้อมใช้");
    expect(html).toContain("กำลังใช้งาน");
    for (const status of ["ready", "repair", "inspection", "pickup", "active", "total"]) {
      expect(html).toContain(`class=\"${status}\"`);
      expect(html).toContain(`>${status === "ready" ? "พร้อมใช้" : status === "repair" ? "ซ่อม" : status === "inspection" ? "คำแนะนำ" : status === "pickup" ? "แจ้งรับรถ" : status === "active" ? "กำลังใช้งาน" : "รวมทั้งหมด"}<`);
    }
  });

  it("uses Supervisor Database status sets for group metrics instead of local vehicle.status", () => {
    const statusModel = buildSupervisorUserDirectoryStatusModel({
      vehicleNumbers: [12, 17, 38],
      guideReports: [{ id: "r-12", vehicleId: "m3-v12", description: "เบรก", reporter: "ไกด์", createdAt: "2026-08-28T01:00:00.000Z", status: "แจ้งซ่อม" }],
      mechanicRepairs: [],
      guidanceVehicleNumbers: [],
      pickupVehicleNumbers: [38],
      activeVehicleNumbers: [],
    });
    const html = renderToStaticMarkup(React.createElement(VehicleResponsibilityGroupView, { vehicles, responsibilityState: state, directoryUsers: [], safetyNotices: [], statusModel, onBack: vi.fn(), onSafetyNoticeOpen: vi.fn() }));
    expect(html).toContain(">1</b><span>พร้อมใช้</span>");
    expect(html).toContain(">1</b><span>ซ่อม</span>");
    expect(html).toContain(">1</b><span>แจ้งรับรถ</span>");
  });

  it("keeps the empty group state readable", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleResponsibilityGroupView, { vehicles: [], responsibilityState: { ...state, responsibilityGroups: [] }, directoryUsers: [], safetyNotices: [], onBack: vi.fn(), onSafetyNoticeOpen: vi.fn() }));
    expect(html).toContain("ยังไม่มีกลุ่มผู้ดูแลรถในฐานข้อมูล");
  });
});
