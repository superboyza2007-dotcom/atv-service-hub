import { describe, expect, it } from "vitest";
import { createQueueState, type BoardMember } from "./team-board-queue-engine";
import { activeSessionEventId } from "./active-session-event";
import { recordActive } from "./team-board-mirror-engine";

const board: BoardMember[] = [
  { id: "external-1", name: "External Guide", shift: "08:00", boardOrder: 1, rounds: 0, role: "floating" },
  { id: "queue-1", name: "Next Guide", shift: "08:00", boardOrder: 2, rounds: 0, role: "floating" },
];

const mirroredEventId = (sessions: Parameters<typeof activeSessionEventId>[0], names: string[]) =>
  `atv:${activeSessionEventId(sessions)}:${names.map((name) => name.trim().toLocaleLowerCase("th-TH")).filter(Boolean).join("|")}`;

describe("Team Board external Active lifecycle", () => {
  it("uses one queue run for a continuing external Active and returns it to the queue tail only when it disappears", () => {
    const initial = createQueueState(board);
    const started = recordActive(initial, { eventId: "external-active-1", activeMemberIds: ["external-1"], now: 100 });

    expect(started.error).toBeUndefined();
    expect(started.state.active).toHaveLength(1);
    expect(started.state.active[0]?.externalEventId).toBe("external-active-1");

    const continued = recordActive(started.state, { eventId: "external-active-2", activeMemberIds: ["external-1"], now: 200 });
    expect(continued.error).toBeUndefined();
    expect(continued.state.active).toHaveLength(1);
    expect(continued.state.active[0]?.id).toBe(started.state.active[0]?.id);
    expect(continued.state.active[0]?.externalEventId).toBe("external-active-2");

    const disappeared = recordActive(continued.state, { eventId: "external-active-3", activeMemberIds: [], now: 300 });
    expect(disappeared.error).toBeUndefined();
    expect(disappeared.state.active).toHaveLength(0);
    expect(disappeared.state.standby).toEqual(["queue-1", "external-1"]);
  });

  it.each([
    ["ended before its scheduled time", "2026-10-15T02:30:00.000Z"],
    ["ended after its scheduled time", "2026-10-15T03:30:00.000Z"],
  ])("returns the mirrored member to the queue when the source session is %s", (_caseName, completedAt) => {
    const initial = createQueueState(board);
    const initialEmpty = recordActive(initial, { eventId: mirroredEventId([], []), activeMemberIds: [], now: 100 });
    const activeSession = [{ sessionId: "M3-20261015-ABCD", status: "Active", scheduledEndAt: "2026-10-15T03:00:00.000Z" }];
    const started = recordActive(initialEmpty.state, {
      eventId: mirroredEventId(activeSession, ["External Guide"]),
      activeMemberIds: ["external-1"],
      now: 200,
      durationSeconds: 1800,
    });

    expect(started.error).toBeUndefined();
    expect(started.state.active).toHaveLength(1);

    const completedSession = [{ ...activeSession[0], status: "Completed", completedAt }];
    const endedEventId = mirroredEventId(completedSession, []);
    expect(endedEventId).not.toBe(mirroredEventId([], []));
    const ended = recordActive(started.state, { eventId: endedEventId, activeMemberIds: [], now: 300 });

    expect(ended.error).toBeUndefined();
    expect(ended.ignored).not.toBe(true);
    expect(ended.exitedRunIds).toEqual([started.state.active[0]?.id]);
    expect(ended.state.active).toHaveLength(0);
    expect(ended.state.standby).toEqual(["queue-1", "external-1"]);

    const duplicateSnapshot = recordActive(ended.state, { eventId: endedEventId, activeMemberIds: [], now: 400 });
    expect(duplicateSnapshot.ignored).toBe(true);
    expect(duplicateSnapshot.state.standby).toEqual(["queue-1", "external-1"]);
  });
});
