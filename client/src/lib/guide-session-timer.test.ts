import { describe, expect, it } from "vitest";
import { reconcileExpiredGuideSessions, releaseVehiclesFromFleetSnapshot } from "@shared/guide-session-timer";

describe("guide session timer reconciliation", () => {
  it("auto-completes expired sessions and releases their vehicle numbers", () => {
    const result = reconcileExpiredGuideSessions(JSON.stringify({ sessions: [{
      sessionId: "M3-1",
      status: "Active",
      timerEnabled: true,
      expiryBehavior: "auto_complete",
      durationMinutes: 30,
      startedAt: "2026-10-27T10:00:00.000Z",
      vehicleIds: ["m3-v12"],
      activityLog: [],
    }], messages: [{ id: "keep-me" }] }), Date.parse("2026-10-27T10:30:05.000Z"));

    const payload = JSON.parse(result.payload);
    expect(result.completedSessionIds).toEqual(["M3-1"]);
    expect(result.releasedVehicleNumbers).toEqual([12]);
    expect(payload.sessions[0]).toMatchObject({ status: "Completed", completedAt: "2026-10-27T10:30:05.000Z", completedByName: "ระบบ" });
    expect(payload.sessions[0].activityLog[0].action).toContain("จบงานอัตโนมัติ");
    expect(payload.messages).toEqual([{ id: "keep-me" }]);
  });

  it("does not complete overtime, disabled, or legacy sessions", () => {
    const payload = JSON.stringify({ sessions: [
      { sessionId: "overtime", status: "Active", timerEnabled: true, expiryBehavior: "overtime", startedAt: "2026-10-27T10:00:00.000Z", durationMinutes: 30 },
      { sessionId: "disabled", status: "Active", timerEnabled: false, expiryBehavior: "auto_complete", startedAt: "2026-10-27T10:00:00.000Z", durationMinutes: 30 },
      { sessionId: "legacy", status: "Active", startedAt: "2026-10-27T10:00:00.000Z", durationMinutes: 30 },
    ] });
    const result = reconcileExpiredGuideSessions(payload, Date.parse("2026-10-27T11:00:00.000Z"));

    expect(result.payload).toBe(payload);
    expect(result.completedSessionIds).toEqual([]);
  });

  it("waits until the scheduled end time", () => {
    const payload = JSON.stringify({ sessions: [{
      sessionId: "future",
      status: "Active",
      timerEnabled: true,
      expiryBehavior: "auto_complete",
      durationMinutes: 30,
      startedAt: "2026-10-27T10:00:00.000Z",
      scheduledEndAt: "2026-10-27T10:45:00.000Z",
      vehicleIds: ["m3-v12"],
    }] });
    const result = reconcileExpiredGuideSessions(payload, Date.parse("2026-10-27T10:30:00.000Z"));
    expect(result.payload).toBe(payload);
    expect(result.completedSessionIds).toEqual([]);
  });

  it("removes returned vehicles from active fleet membership without changing unrelated fields", () => {
    const source = JSON.stringify({
      vehicleDatabase: [{ number: 12 }, { number: 18 }],
      vehicleState: { version: 1, updatedAt: 1, vehicleGroups: [{ cc: "200cc", numbers: [12, 18], inUse: [12, 18], unavailable: [] }], responsibilityGroups: [] },
    });
    const result = JSON.parse(releaseVehiclesFromFleetSnapshot(source, [12], 99));
    expect(result.vehicleState.vehicleGroups[0].inUse).toEqual([18]);
    expect(result.vehicleState.updatedAt).toBe(99);
    expect(result.vehicleDatabase).toEqual([{ number: 12 }, { number: 18 }]);
  });
});
