import type { BoardMember, QueueState } from "./team-board-queue-engine";

export type RegistrationRow = { id: string; shift: string; slot1: string; slot2: string };

/** Exact membership projection used by the 02 / CARD Standby list. */
export function selectStandbyCardItems(state: QueueState): BoardMember[] {
  const activeIds = new Set(state.active.flatMap((run) => run.memberIds));
  return state.standby
    .map((id) => state.members[id])
    .filter((member): member is BoardMember => Boolean(member) && (member.isShadow || (member.role !== "floating" && !activeIds.has(member.id))));
}

/** Keep the 02 / CARD grouping rule: group by team identity in first-seen order. */
export function groupStandbyCardItems(items: BoardMember[]): BoardMember[][] {
  return Object.values(items.reduce<Record<string, BoardMember[]>>((groups, member) => {
    const key = member.teamId ?? `individual-${member.id}`;
    (groups[key] ??= []).push(member);
    return groups;
  }, {}));
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
