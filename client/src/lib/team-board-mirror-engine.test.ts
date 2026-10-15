import { describe, expect, it } from "vitest";
import { createQueueState, dispatch as engineDispatch, type BoardMember } from "./team-board-queue-engine";
import { restoreLegacyAtvMirrorRuns, recordActive } from "./team-board-mirror-engine";

const board: BoardMember[] = [
  { id: "external-1", name: "External Guide", shift: "08:00", boardOrder: 1, rounds: 0, role: "floating" },
  { id: "queue-1", name: "Next Guide", shift: "08:00", boardOrder: 2, rounds: 0, role: "floating" },
  { id: "queue-2", name: "Following Guide", shift: "08:00", boardOrder: 3, rounds: 0, role: "floating" },
];

describe("Team Board external Active lifecycle", () => {
  it("keeps the existing manual mirror operation and returns it through the existing completion lifecycle", () => {
    const started = recordActive(createQueueState(board), { eventId: "manual-active-1", activeMemberIds: ["external-1"], now: 100 });
    expect(started.error).toBeUndefined();
    expect(started.state.active).toHaveLength(1);
    expect(started.state.active[0]?.externalEventId).toBe("manual-active-1");

    const nextSnapshot = recordActive(started.state, { eventId: "manual-active-2", activeMemberIds: [], now: 200 });
    expect(nextSnapshot.error).toBeUndefined();
    expect(nextSnapshot.state.active).toHaveLength(0);
    expect(nextSnapshot.state.standby).toEqual(["queue-1", "queue-2", "external-1"]);
  });

  it("removes only legacy synthetic ATV mirror runs without awarding rounds or changing roles", () => {
    const initial = createQueueState(board);
    const oldSourceRun = recordActive(initial, { eventId: "atv:old-source-snapshot", activeMemberIds: ["external-1"], now: 100 });
    const independentRun = engineDispatch(oldSourceRun.state, { memberIds: ["queue-1"], units: 0.5, mode: "normal", now: 150 });
    expect(independentRun.error).toBeUndefined();

    const cleaned = restoreLegacyAtvMirrorRuns(independentRun.state);
    expect(cleaned).toBeDefined();
    expect(cleaned?.active.map((run) => run.memberIds)).toEqual([["queue-1"]]);
    expect(cleaned?.active[0]?.id).toBe(independentRun.run?.id);
    expect(cleaned?.standby).toEqual(["queue-2", "external-1"]);
    expect(cleaned?.members["external-1"]?.rounds).toBe(0);
    expect(cleaned?.members["queue-1"]?.rounds).toBe(0);
    expect(cleaned?.members["external-1"]?.role).toBe(initial.members["external-1"]?.role);
    expect(cleaned?.members["queue-1"]?.role).toBe(independentRun.state.members["queue-1"]?.role);
  });

  it("does not modify queue state when there are no former synthetic ATV runs", () => {
    const state = createQueueState(board);
    expect(restoreLegacyAtvMirrorRuns(state)).toBeUndefined();
    expect(state.active).toEqual([]);
    expect(state.standby).toEqual(["external-1", "queue-1", "queue-2"]);
  });
});
