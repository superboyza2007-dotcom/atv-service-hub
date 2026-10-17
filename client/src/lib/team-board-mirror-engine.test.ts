import { describe, expect, it } from "vitest";
import { createQueueState, dispatch as engineDispatch, type BoardMember } from "./team-board-queue-engine";
import { recordActive, recordActiveSessions, restoreLegacyAtvMirrorRuns, selectVisibleActiveRuns } from "./team-board-mirror-engine";
import { selectStandbyCardItems } from "./team-board-queue-view";

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

  it("does not return a legacy Active run just because a newer run exists", () => {
    const initial = createQueueState(board);
    const oldSourceRun = recordActive(initial, { eventId: "atv:old-source-snapshot", activeMemberIds: ["external-1"], now: 100 });
    const independentRun = engineDispatch(oldSourceRun.state, { memberIds: ["queue-1"], units: 0.5, mode: "normal", now: 150 });
    expect(independentRun.error).toBeUndefined();

    expect(restoreLegacyAtvMirrorRuns(independentRun.state)).toBeUndefined();
    expect(independentRun.state.active.map((run) => run.memberIds)).toEqual([["external-1"], ["queue-1"]]);
    expect(independentRun.state.standby).toEqual(["queue-2"]);
    expect(independentRun.state.members["external-1"]?.rounds).toBe(0);
    expect(independentRun.state.members["queue-1"]?.rounds).toBe(0);
  });

  it("does not modify queue state when there are no former synthetic ATV runs", () => {
    const state = createQueueState(board);
    expect(restoreLegacyAtvMirrorRuns(state)).toBeUndefined();
    expect(state.active).toEqual([]);
    expect(state.standby).toEqual(["external-1", "queue-1", "queue-2"]);
  });

  it("renders source 2.3 sessions instead of their mirrored runs while keeping manual runs visible", () => {
    const started = recordActiveSessions(createQueueState(board), {
      eventId: "2.3:snapshot-1",
      sessions: [
        { sessionId: "M3-001", memberIds: ["external-1"], startedAt: 100, durationSeconds: 1_800 },
        { sessionId: "M3-002", memberIds: ["queue-1"], startedAt: 100, durationSeconds: 1_800 },
      ],
      now: 100,
    });
    expect(started.error).toBeUndefined();
    const manual = engineDispatch(started.state, { memberIds: ["queue-2"], units: 0.5, mode: "normal", now: 150 });
    expect(manual.error).toBeUndefined();

    const visible = selectVisibleActiveRuns(manual.state.active, true);
    expect(visible.map((run) => run.memberIds)).toEqual([["queue-2"]]);
    expect(selectVisibleActiveRuns(manual.state.active, false)).toHaveLength(3);

    const legacy = recordActive(createQueueState(board), { eventId: "atv:legacy", activeMemberIds: ["external-1"], now: 200 });
    expect(selectVisibleActiveRuns(legacy.state.active, true)).toEqual([]);
  });

  it("keeps a source Active run pending when the snapshot becomes empty", () => {
    const teamBoard: BoardMember[] = [
      { id: "active-a", name: "Active A", teamId: "team-active", partnerId: "active-b", shift: "08:00", boardOrder: 1, rounds: 0, role: "te" },
      { id: "active-b", name: "Active B", teamId: "team-active", partnerId: "active-a", shift: "08:00", boardOrder: 2, rounds: 0, role: "te" },
      { id: "waiting-a", name: "Waiting A", teamId: "team-waiting", partnerId: "waiting-b", shift: "08:00", boardOrder: 3, rounds: 0, role: "te" },
      { id: "waiting-b", name: "Waiting B", teamId: "team-waiting", partnerId: "waiting-a", shift: "08:00", boardOrder: 4, rounds: 0, role: "te" },
    ];
    const initial = createQueueState(teamBoard);
    const empty = recordActiveSessions(initial, { eventId: "2.3:empty", sessions: [], now: 50 });
    const started = recordActiveSessions(empty.state, {
      eventId: "2.3:active-1",
      sessions: [{ sessionId: "M3-001", memberIds: ["active-a", "active-b"], startedAt: 100, durationSeconds: null }],
      now: 100,
    });
    expect(started.error).toBeUndefined();
    expect(started.state.standby).toEqual(["waiting-a", "waiting-b"]);
    expect(selectStandbyCardItems(started.state).map(member => member.id)).toEqual(["waiting-a", "waiting-b"]);

    const returned = recordActiveSessions(started.state, { eventId: "2.3:empty", sessions: [], now: 200 });
    expect(returned.error).toBeUndefined();
    expect(returned.state.active.filter(run => run.sourceSessionId).map(run => run.sourceSessionId)).toEqual(["M3-001"]);
    expect(returned.state.standby).toEqual(["waiting-a", "waiting-b"]);
    expect(returned.state.members["active-a"]?.rounds).toBe(0);
    expect(returned.state.members["active-b"]?.rounds).toBe(0);

    const laterSession = recordActiveSessions(returned.state, {
      eventId: "2.3:active-2",
      sessions: [{ sessionId: "M3-002", memberIds: ["waiting-a", "waiting-b"], startedAt: 210, durationSeconds: null }],
      now: 210,
    });
    expect(laterSession.error).toBeUndefined();
    expect(laterSession.state.active.map(run => run.sourceSessionId)).toEqual(["M3-001", "M3-002"]);
  });

  it("routes each 2.3 Active Session through the same queue rules without merging sessions", () => {
    const started = recordActiveSessions(createQueueState(board), {
      eventId: "2.3:snapshot-1",
      sessions: [
        { sessionId: "M3-001", memberIds: ["external-1"], startedAt: 100, durationSeconds: 1_800 },
        { sessionId: "M3-002", memberIds: ["queue-1"], startedAt: 100, durationSeconds: 1_800 },
      ],
      now: 100,
    });
    expect(started.error).toBeUndefined();
    expect(started.state.active.map(run => [run.id, run.sourceSessionId, run.memberIds])).toEqual([
      ["AR-M3-001", "M3-001", ["external-1"]],
      ["AR-M3-002", "M3-002", ["queue-1"]],
    ]);
    expect(started.state.standby).toEqual(["queue-2"]);

    const next = recordActiveSessions(started.state, {
      eventId: "2.3:snapshot-2",
      sessions: [{ sessionId: "M3-002", memberIds: ["queue-1"], startedAt: 100, durationSeconds: 1_800 }],
      now: 200,
    });
    expect(next.error).toBeUndefined();
    expect(next.state.active.map(run => run.sourceSessionId)).toEqual(["M3-001", "M3-002"]);
    expect(next.state.standby).toEqual(["queue-2"]);
  });
});
