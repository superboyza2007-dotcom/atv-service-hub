import { describe, expect, it } from "vitest";
import { createQueueState, dispatch } from "./team-board-queue-engine";
import { recordActiveSessions } from "./team-board-mirror-engine";
import { expiredLocalRunIds, runClock } from "./team-board-run-timing";

const board = [{ id: "g1", name: "Guide", shift: "08:00", boardOrder: 1, rounds: 0, role: "floating" as const }];

describe("Team Board run timing", () => {
  it("counts up from the actual start time and never auto-expires an unlimited run", () => {
    const result = dispatch(createQueueState(board), { memberIds: ["g1"], units: 0.5, now: 1_000, durationSeconds: null });
    expect(result.run).toBeDefined();
    expect(runClock(result.run!, 3_601_000, 30)).toEqual({ mode: "elapsed", seconds: 3_600 });
    expect(expiredLocalRunIds(result.state.active, 99_999_000, null)).toEqual([]);
  });

  it("keeps finite program timers counting down and expires them only at their configured limit", () => {
    const result = dispatch(createQueueState(board), { memberIds: ["g1"], units: 0.5, now: 1_000, durationSeconds: 60 });
    expect(runClock(result.run!, 31_000, 30)).toEqual({ mode: "remaining", seconds: 30 });
    expect(expiredLocalRunIds(result.state.active, 60_999, 30)).toEqual([]);
    expect(expiredLocalRunIds(result.state.active, 61_000, 30)).toEqual([result.run!.id]);
  });

  it("uses the selected default for older runs without a stored duration", () => {
    const result = dispatch(createQueueState(board), { memberIds: ["g1"], units: 0.5, now: 1_000 });
    expect(runClock(result.run!, 31_000, 60)).toEqual({ mode: "remaining", seconds: 30 });
    expect(expiredLocalRunIds(result.state.active, 61_000, 60)).toEqual([result.run!.id]);
  });

  it("preserves unlimited timing when mirroring an external Active session", () => {
    const result = recordActiveSessions(createQueueState(board), {
      eventId: "2.3:unlimited",
      sessions: [{ sessionId: "M3-001", memberIds: ["g1"], startedAt: 1_000, durationSeconds: null }],
      now: 1_000,
    });
    expect(result.state.active[0]?.durationSeconds).toBeNull();
    expect(runClock(result.state.active[0]!, 3_601_000, 30)).toEqual({ mode: "elapsed", seconds: 3_600 });
    expect(expiredLocalRunIds(result.state.active, 99_999_000, 30)).toEqual([]);
  });
});
