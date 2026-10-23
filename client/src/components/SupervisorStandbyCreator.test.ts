import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SupervisorStandbyCreator } from "./SupervisorStandbyCreator";

describe("SupervisorStandbyCreator", () => {
  it("shows the creator separately and exposes the supervisor as a manual worker choice", () => {
    const html = renderToStaticMarkup(React.createElement(SupervisorStandbyCreator, {
      vehicles: [{ number: 12, cc: "200", status: "ready", color: "#22d3ee", group: "Route A" }],
      members: [{ id: "g1", name: "ไกด์หนึ่ง", role: "ไกด์" }, { id: "s1", name: "หัวหน้าหนึ่ง", role: "หัวหน้า" }],
      busyVehicleNumbers: new Set<number>(),
      creatorName: "หัวหน้าหนึ่ง",
      onBack: vi.fn(),
      onCreate: vi.fn(),
    }));
    expect(html).toContain("ผู้สร้างห้อง: หัวหน้าหนึ่ง");
    expect(html).toContain("#22d3ee");
    expect(html).toContain("Route A");
    expect(html).toContain("หัวหน้าหนึ่ง");
    expect(html).toContain("ส่งข้อมูล → 2.2 Standby");
    expect(html).not.toContain("<select");
  });

  it("shows guidance before selection without blocking the vehicle", () => {
    const html = renderToStaticMarkup(React.createElement(SupervisorStandbyCreator, {
      vehicles: [{ number: 14, cc: "250", status: "ready", color: "#ff5900", group: "1" }],
      members: [{ id: "s1", name: "หัวหน้า", role: "หัวหน้า" }],
      busyVehicleNumbers: new Set<number>(),
      creatorName: "หัวหน้า",
      activeUserId: "s1",
      safetyNotices: [{ id: "AL-14", vehicleNumber: 14, description: "ตรวจเบรก", severity: "ปกติ", reporter: "ช่าง", createdAt: "2026-08-28T02:00:00.000Z" }],
      onSafetyNoticeOpen: vi.fn(),
      onBack: vi.fn(),
      onCreate: vi.fn(),
    }));
    expect(html).toContain("พร้อมใช้ · มีคำแนะนำ");
    expect(html).toContain("เปิดคำแนะนำจากช่างของรถหมายเลข 14");
    expect(html).not.toContain('disabled=""');
  });

  it("requires a selected worker and active user before creating", () => {
    const onCreate = vi.fn();
    const html = renderToStaticMarkup(React.createElement(SupervisorStandbyCreator, {
      vehicles: [{ number: 12, cc: "200", status: "ready", color: "#22d3ee", group: "Route A" }],
      members: [],
      busyVehicleNumbers: new Set<number>(),
      creatorName: "หัวหน้า",
      activeUserId: "s1",
      onBack: vi.fn(),
      onCreate,
    }));
    expect(html).toContain("ผู้ทำรายการจะเป็นหัวหน้าที่ล็อกอินด้วย ID นี้เสมอ และไม่ต้องเลือกซ้ำ");
    expect(onCreate).not.toHaveBeenCalled();
    expect(html).toContain("ID s1");
  });
});
