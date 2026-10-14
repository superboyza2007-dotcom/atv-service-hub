import { describe, expect, it } from "vitest";
import { createActiveQueueSnapshot, reconcileActiveSnapshot } from "./activeQueueAdapter";

describe("Active Queue adapter", () => {
  it("creates one complete run per active session and ignores a replayed event", () => {
    const snapshot = createActiveQueueSnapshot([{
      position: 1,
      sessionId: 42,
      sessionCode: "M3-042",
      startedAt: new Date("2026-08-25T03:00:00.000Z"),
      durationMinutes: 30,
      elapsedSeconds: 600,
      remainingSeconds: 1_200,
      vehicles: [
        { id: 12, number: 12, engineCc: "200", groupName: "กลุ่ม A" },
        { id: 17, number: 17, engineCc: "200", groupName: "กลุ่ม A" },
      ],
    }], 123_456);

    expect(snapshot.activeRuns).toEqual([expect.objectContaining({ id: "42", vehicleIds: [12, 17] })]);
    expect(reconcileActiveSnapshot(snapshot.eventId, snapshot).ignored).toBe(true);
    expect(reconcileActiveSnapshot(undefined, snapshot).ignored).toBe(false);
  });
});
