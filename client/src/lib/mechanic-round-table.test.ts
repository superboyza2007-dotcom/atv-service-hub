import { describe, expect, it } from "vitest";
import { filterMechanicRoundTableUsers, filterSupervisorRoundTableUsers, getVisibleMechanicRoundTableUsers } from "@/lib/mechanic-round-table";
import { buildPersonalPayoutRows, updatePersonalPayoutValue } from "@/lib/mechanic-payout-table";

describe("mechanic round table users", () => {
  const users = [
    { id: 1, name: "ไกด์หนึ่ง", group: "ไกด์", code: "G-001" },
    { id: 2, name: "ช่างหนึ่ง", group: "ช่างซ่อม ATV", code: "M-001" },
    { id: 3, name: "ดิวตี้หนึ่ง", group: "ดิวตี้", code: "D-001" },
    { id: 4, name: "หัวหน้าหนึ่ง", group: "หัวหน้า", code: "S-001" },
    { id: 5, name: "ไม่มีรหัส", group: "ช่าง" },
  ];

  it("keeps only valid Guide and Mechanic directory users", () => {
    expect(filterMechanicRoundTableUsers(users)).toEqual([
      { id: 1, name: "ไกด์หนึ่ง", group: "ไกด์", code: "G-001" },
      { id: 2, name: "ช่างหนึ่ง", group: "ช่าง", code: "M-001" },
    ]);
  });

  it("shows the table for the logged-in user by numeric ID or code", () => {
    expect(getVisibleMechanicRoundTableUsers(users, "2").map(user => user.code)).toEqual(["M-001"]);
    expect(getVisibleMechanicRoundTableUsers(users, "g-001").map(user => user.name)).toEqual(["ไกด์หนึ่ง"]);
  });

  it("shows an authenticated mechanic from the sanitized directory without exposing plaintext code", () => {
    const sanitizedUsers = [{ id: 6, name: "ช่างจาก Server", group: "ช่าง", hasCode: true }];
    expect(getVisibleMechanicRoundTableUsers(sanitizedUsers, "6")).toEqual([
      { id: 6, name: "ช่างจาก Server", group: "ช่าง", hasCode: true, code: "" },
    ]);
  });

  it("does not expose every user's table when the login key is absent or belongs to another role", () => {
    expect(getVisibleMechanicRoundTableUsers(users)).toEqual([]);
    expect(getVisibleMechanicRoundTableUsers(users, "D-001")).toEqual([]);
  });

  it("keeps supervisor payout users from the sanitized hasCode directory contract", () => {
    expect(filterSupervisorRoundTableUsers([
      { id: 10, name: "ไกด์ที่ปิดรหัส", group: "ไกด์", hasCode: true },
      { id: 11, name: "ช่างที่ไม่มี credential", group: "ช่าง", hasCode: false },
      { id: 12, name: "หัวหน้า", group: "หัวหน้า", hasCode: true },
    ])).toEqual([{ id: 10, name: "ไกด์ที่ปิดรหัส", group: "ไกด์", hasCode: true, code: "" }]);
  });
});

describe("personal mechanic payout table", () => {
  const sessions = [
    { status: "Completed", durationMinutes: 30, memberIds: ["2001"], completedAt: "2026-08-25T03:00:00.000Z", createdAt: "2026-08-25T02:30:00.000Z" },
    { status: "Completed", durationMinutes: 60, memberIds: ["2002"], completedAt: "2026-08-25T04:00:00.000Z", createdAt: "2026-08-25T03:00:00.000Z" },
    { status: "Completed", durationMinutes: 60, memberIds: ["2001", "2002"], completedAt: "2026-08-26T04:00:00.000Z", createdAt: "2026-08-26T03:00:00.000Z" },
    { status: "Active", durationMinutes: 30, memberIds: ["2001"], createdAt: "2026-08-26T05:00:00.000Z" },
  ];

  it("counts only completed sessions belonging to the logged-in mechanic", () => {
    const rows = buildPersonalPayoutRows({ year: 2026, month: 7, half: 2, userId: "2001", sessions });
    expect(rows.find(row => row.key === "2026-08-25")?.rounds).toEqual([1, 0]);
    expect(rows.find(row => row.key === "2026-08-26")?.rounds).toEqual([0, 1]);
    expect(rows.reduce((sum, row) => sum + row.totalRounds, 0)).toBe(2);
  });

  it("counts a completed session by activeUserId even when memberIds is missing", () => {
    const rows = buildPersonalPayoutRows({ year: 2026, month: 7, half: 2, userId: "2001", sessions: [{ status: "Completed", durationMinutes: 30, activeUserId: "2001", createdAt: "2026-08-27T02:00:00.000Z", completedAt: "2026-08-27T02:30:00.000Z" }] });
    expect(rows.find(row => row.key === "2026-08-27")?.rounds).toEqual([1, 0]);
  });

  it("persists a manual round under the current user's ID without changing another user", () => {
    const next = updatePersonalPayoutValue({}, "2001", "2026-08-25", 30, "3", sessions);
    expect(next["2001"]["2026-08-25"]).toEqual({ 30: 3, 60: 0 });
    expect(next["2002"]).toBeUndefined();
  });
});
