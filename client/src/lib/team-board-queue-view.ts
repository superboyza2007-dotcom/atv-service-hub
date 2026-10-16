import type { BoardMember, QueueState } from "./team-board-queue-engine";

export type RegistrationRow = { id: string; shift: string; slot1: string; slot2: string };

/** Exact membership projection used by the 02 / CARD Standby list. */
export function selectStandbyCardItems(state: QueueState): BoardMember[] {
  const activeIds = new Set(state.active.flatMap((run) => run.memberIds));
  return state.standby
    .map((id) => state.members[id])
    .filter((member): member is BoardMember => Boolean(member) && (member.isShadow || (member.role !== "floating" && !activeIds.has(member.id))));
}

/** Keep the exact Standby order: only pair teammates already adjacent in the queue. */
export function groupStandbyCardItems(items: BoardMember[]): BoardMember[][] {
  return groupStandbyByAdjacentTeam(items);
}

/** Pair only adjacent teammates; never pull a returning member ahead of the live queue. */
export function groupStandbyByAdjacentTeam(members: BoardMember[]): BoardMember[][] {
  const groups: BoardMember[][] = [];
  for (const member of members) {
    const previous = groups.at(-1);
    if (member.teamId && previous?.length === 1 && previous[0]?.teamId === member.teamId) {
      previous.push(member);
    } else {
      groups.push([member]);
    }
  }
  return groups;
}
