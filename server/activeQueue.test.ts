import { describe, expect, it } from "vitest";
import { buildActiveQueue } from "./vehicleFlowService";

describe("Active Queue", () => {
  it("groups every vehicle in the same Active session and orders by start time", () => {
    const now = new Date("2026-08-25T04:00:00.000Z");
    const queue = buildActiveQueue([
      { sessionId: 2, sessionCode: "M3-002", startedAt: new Date("2026-08-25T03:40:00.000Z"), createdAt: new Date("2026-08-25T03:39:00.000Z"), durationMinutes: 30, vehicleId: 23, vehicleNumber: 23, engineCc: "250" as const, groupName: "กลุ่ม B" },
      { sessionId: 1, sessionCode: "M3-001", startedAt: new Date("2026-08-25T03:30:00.000Z"), createdAt: new Date("2026-08-25T03:29:00.000Z"), durationMinutes: 60, vehicleId: 12, vehicleNumber: 12, engineCc: "200" as const, groupName: "กลุ่ม A" },
      { sessionId: 1, sessionCode: "M3-001", startedAt: new Date("2026-08-25T03:30:00.000Z"), createdAt: new Date("2026-08-25T03:29:00.000Z"), durationMinutes: 60, vehicleId: 17, vehicleNumber: 17, engineCc: "200" as const, groupName: "กลุ่ม A" },
    ], now);

    expect(queue).toHaveLength(2);
    expect(queue[0]).toMatchObject({ position: 1, sessionCode: "M3-001", remainingSeconds: 1_800 });
    expect(queue[0]?.vehicles.map(vehicle => vehicle.number)).toEqual([12, 17]);
    expect(queue[1]).toMatchObject({ position: 2, sessionCode: "M3-002", remainingSeconds: 600 });
  });
});
