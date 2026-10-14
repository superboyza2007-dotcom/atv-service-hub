import { describe, expect, it } from "vitest";
import {
  buildSupervisorActiveMemberSnapshots,
  findSupervisorGuideSession,
  normalizeSupervisorGuideMembers,
  normalizeSupervisorGuideSessions,
  summarizeSupervisorGuideStatus,
} from "./supervisor-guide-operations";

describe("supervisor guide operations", () => {
  it("normalizes valid Guide sessions and ignores malformed records", () => {
    const sessions = normalizeSupervisorGuideSessions([
      { sessionId: "S-001", status: "Active", durationMinutes: 60, vehicleIds: ["m3-v1"], memberIds: ["1"], riderCount: 2, passengerCount: 1, createdAt: "2026-08-26T01:00:00.000Z", startedAt: "2026-08-26T01:05:00.000Z", overtimeAcknowledged: true },
      { sessionId: "bad", status: "Unknown", durationMinutes: 30 },
      { sessionId: "bad-duration", status: "Standby", durationMinutes: 45 },
    ]);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ sessionId: "S-001", status: "Active", durationMinutes: 60, vehicleIds: ["m3-v1"], overtimeAcknowledged: true });
  });

  it("opens the selected Active session from the Supervisor dashboard feed", () => {
    const sessions = normalizeSupervisorGuideSessions([
      { sessionId: "ACTIVE-OPEN", status: "Active", durationMinutes: 30, vehicleIds: ["m3-v61"], memberIds: ["1"], riderCount: 1, passengerCount: 0, createdAt: "2026-08-26T01:00:00.000Z" },
    ]);
    expect(findSupervisorGuideSession(sessions, "ACTIVE-OPEN")).toMatchObject({ sessionId: "ACTIVE-OPEN", status: "Active" });
    expect(findSupervisorGuideSession(sessions, "missing")).toBeUndefined();
  });

  it("aggregates every vehicle across groups while keeping safety notices informational", () => {
    const vehicles = [
      { number: "1", cc: "200" as const, status: "ready" as const },
      { number: "2", cc: "200" as const, status: "active" as const },
      { number: "3", cc: "250" as const, status: "repair" as const },
      { number: "4", cc: "250" as const, status: "pickup" as const },
    ];
    expect(summarizeSupervisorGuideStatus(vehicles, [{ vehicleNumber: 2 }, { vehicleNumber: 4 }])).toEqual({ ready: 1, repair: 1, alert: 2, pickup: 1, active: 1, total: 4 });
    expect(summarizeSupervisorGuideStatus(vehicles.filter(vehicle => vehicle.cc === "200"), [{ vehicleNumber: 2 }, { vehicleNumber: 4 }])).toMatchObject({ total: 2, alert: 1, active: 1 });
  });

  it("uses Guide member ids to build the same Active feed for the shared run queue", () => {
    const members = normalizeSupervisorGuideMembers([{ id: "1", name: "ไกด์เอ" }, { id: "2", name: "ไกด์บี" }]);
    const sessions = normalizeSupervisorGuideSessions([{ sessionId: "S-002", status: "Active", durationMinutes: 30, vehicleIds: ["m3-v1"], memberIds: ["1", "missing", "2"], createdAt: "2026-08-26T01:00:00.000Z", startedAt: "2026-08-26T01:05:00.000Z" }]);
    expect(buildSupervisorActiveMemberSnapshots(sessions, members)).toEqual([
      { sessionId: "S-002", memberId: "1", name: "ไกด์เอ", startedAt: "2026-08-26T01:05:00.000Z", durationMinutes: 30 },
      { sessionId: "S-002", memberId: "2", name: "ไกด์บี", startedAt: "2026-08-26T01:05:00.000Z", durationMinutes: 30 },
    ]);
  });
});
