import { describe, expect, it } from "vitest";
import { activeSessionEventId } from "./active-session-event";

describe("activeSessionEventId", () => {
  it("preserves the sorted active session IDs used by the existing mirror", () => {
    expect(activeSessionEventId([
      { sessionId: "M3-B", status: "Active" },
      { sessionId: "M3-A", status: "Active" },
      { sessionId: "M3-DONE", status: "Completed", completedAt: "2026-10-14T09:00:00.000Z" },
    ])).toBe("M3-A|M3-B");
  });

  it("distinguishes a completed session from the initial empty snapshot and stays stable on repeat", () => {
    const emptyId = activeSessionEventId([]);
    const completed = [{ sessionId: "M3-101", status: "Completed", completedAt: "2026-10-15T02:20:00.000Z" }];

    expect(emptyId).toBe("atv-empty");
    expect(activeSessionEventId(completed)).not.toBe(emptyId);
    expect(activeSessionEventId(completed)).toBe(activeSessionEventId(completed));
  });

  it("gives a new completion a new terminal event ID even when the board becomes empty again", () => {
    const first = [{ sessionId: "M3-101", status: "Completed", completedAt: "2026-10-15T02:20:00.000Z" }];
    const second = [
      ...first,
      { sessionId: "M3-102", status: "Completed", completedAt: "2026-10-15T02:45:00.000Z" },
    ];

    expect(activeSessionEventId(second)).not.toBe(activeSessionEventId(first));
  });

  it("uses a stable terminal marker for a timed-out session", () => {
    const timedOut = [{ sessionId: "M3-103", status: "TIME_EXPIRED", scheduledEndAt: "2026-10-15T03:00:00.000Z" }];

    expect(activeSessionEventId(timedOut)).toContain("M3-103");
    expect(activeSessionEventId(timedOut)).toBe(activeSessionEventId(timedOut));
  });

  it("does not change the event identity when only a standby session is added", () => {
    const before = [{ sessionId: "M3-DONE", status: "Completed", completedAt: "2026-10-15T02:20:00.000Z" }];
    const after = [...before, { sessionId: "M3-STANDBY", status: "Standby" }];

    expect(activeSessionEventId(after)).toBe(activeSessionEventId(before));
  });
});
