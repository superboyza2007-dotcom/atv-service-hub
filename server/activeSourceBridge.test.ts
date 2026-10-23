import { describe, expect, it } from "vitest";
import { buildActiveQueueBridgeSnapshot } from "./activeSourceBridge";

describe("2.3 Active queue bridge", () => {
  it("converts only Active sessions and resolves member ids to names", () => {
    const result = buildActiveQueueBridgeSnapshot(
      JSON.stringify({ sessions: [
        { sessionId: "M3-002", status: "Standby", memberIds: ["m2"] },
        { sessionId: "M3-001", status: "Active", memberIds: ["m1", "m2", "m1"], activeUserName: "หัวหน้า", startedAt: "2026-10-22T02:00:00.000Z", durationMinutes: 30 },
      ] }),
      JSON.stringify({ members: [{ id: "m1", name: "Boy" }, { id: "m2", name: "Por" }] }),
      new Date("2026-10-22T02:05:00.000Z"),
    );

    expect(result.source).toBe("guide-2.3-active");
    expect(result.sessions).toEqual([{
      sessionId: "M3-001",
      memberNames: ["Boy", "Por"],
      activeUserName: "หัวหน้า",
      startedAt: "2026-10-22T02:00:00.000Z",
      durationMinutes: 30,
    }]);
    expect(result.completedSessionIds).toEqual([]);
    expect(result.eventId).toMatch(/^2\.3-active:[a-f0-9]{24}$/);
  });

  it("emits an explicit completion signal separately from source disappearance", () => {
    const result = buildActiveQueueBridgeSnapshot(
      JSON.stringify({ sessions: [
        { sessionId: "M3-001", status: "Completed", memberIds: ["m1"], completedAt: "2026-10-22T02:10:00.000Z" },
        { sessionId: "M3-002", status: "Standby", memberIds: ["m2"] },
      ] }),
      JSON.stringify({ members: [{ id: "m1", name: "Boy" }, { id: "m2", name: "Por" }] }),
    );

    expect(result.sessions).toEqual([]);
    expect(result.completedSessionIds).toEqual(["M3-001"]);
  });

  it("returns an empty, stable projection for missing or malformed snapshots", () => {
    const first = buildActiveQueueBridgeSnapshot("not-json", null, new Date("2026-10-22T02:05:00.000Z"));
    const second = buildActiveQueueBridgeSnapshot("{}", "{}", new Date("2026-10-22T02:06:00.000Z"));

    expect(first.sessions).toEqual([]);
    expect(first.completedSessionIds).toEqual([]);
    expect(first.eventId).toBe(second.eventId);
    expect(first.capturedAt).not.toBe(second.capturedAt);
  });
});
