import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/trpc", () => {
  const useMutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn().mockResolvedValue(null), isPending: false });
  return {
    trpc: {
      operationsSnapshots: { merge: { useMutation } },
      directory: { authenticate: { useMutation }, specialAuthenticate: { useMutation } },
    },
};
});

import { shouldStartSupervisorNavSwipe, SupervisorPayoutOverview } from "./SupervisorPayoutOverview";

const sessions = [{ status: "Completed", durationMinutes: 30, activeUserId: "1", completedAt: "2026-08-27T02:30:00.000Z", createdAt: "2026-08-27T02:00:00.000Z" }];

describe("SupervisorPayoutOverview", () => {
  it("renders the shared table and only the supplied guide/mechanic users", () => {
    const element = React.createElement(SupervisorPayoutOverview, { users: [{ id: 1, name: "ไกด์หนึ่ง", code: "G-001", group: "ไกด์" }, { id: 2, name: "ช่างหนึ่ง", code: "M-001", group: "ช่าง" }], sessions, values: {} });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("ตารางค่ารอบ");
    expect(html).toContain("ไกด์หนึ่ง");
    expect(html).toContain("ช่างหนึ่ง");
    expect(html).toContain("หัวหน้ามีสิทธิ์ดูข้อมูลรวมทุกคน");
    expect(html).toContain("supervisor-floating-payout-nav");
    expect(html).toContain("supervisor-vertical-user-nav");
    expect(html).toContain("is-open");
    expect(html).toContain("nav-dock-handle");
    expect(html).toContain("aria-label=\"ดูตารางของ\"");
    expect(html).toContain("ไกด์หนึ่ง");
    expect(html).not.toContain("ไกด์ · G-001</small>");
    expect(html).not.toContain("ช่าง · M-001</small>");
    expect(html).not.toContain("ผู้ใช้งานปัจจุบัน");
  });

  it("does not start a rail swipe when a pointer begins on an interactive button", () => {
    const buttonTarget = { closest: (selector: string) => selector === "button" ? {} : null };
    const railSurface = { closest: () => null };
    expect(shouldStartSupervisorNavSwipe(buttonTarget)).toBe(false);
    expect(shouldStartSupervisorNavSwipe(railSurface)).toBe(true);
  });

  it("shows an automatic empty state when no eligible users exist", () => {
    const element = React.createElement(SupervisorPayoutOverview, { users: [], sessions: [], values: {} });
    const html = renderToStaticMarkup(element);
    expect(html).toContain("ยังไม่มีรายชื่อไกด์หรือช่างในระบบ");
    expect(html).toContain("เพิ่มผู้ใช้บทบาทไกด์หรือช่าง");
  });
});
