import type { BoardMember } from "./team-board-queue-engine";

export type RegistrationRow = { id: string; shift: string; slot1: string; slot2: string };

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
