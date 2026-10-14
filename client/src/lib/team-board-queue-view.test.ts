import { describe, expect, it } from "vitest";
import type { BoardMember } from "./team-board-queue-engine";
import { groupStandbyByAdjacentTeam } from "./team-board-queue-view";

const member = (id: string, teamId: string, boardOrder: number): BoardMember => ({
  id,
  name: id,
  teamId,
  shift: "08:00",
  boardOrder,
  rounds: 0,
  role: "te",
});

describe("Team Board queue view", () => {
  it("does not pull a returned teammate forward to their partner's earlier queue position", () => {
    const standby = [
      member("partner", "team-a", 1),
      member("next", "team-b", 2),
      member("returned", "team-a", 3),
    ];

    const groups = groupStandbyByAdjacentTeam(standby);

    expect(groups.map(group => group.map(item => item.id))).toEqual([
      ["partner"],
      ["next"],
      ["returned"],
    ]);
    expect(groups.flat().map(item => item.id)).toEqual(["partner", "next", "returned"]);
  });
});
