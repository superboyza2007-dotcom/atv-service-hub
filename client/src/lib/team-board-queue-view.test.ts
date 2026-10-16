import { describe, expect, it } from "vitest";
import { createQueueState, type BoardMember } from "./team-board-queue-engine";
import { groupStandbyCardItems, selectStandbyCardItems } from "./team-board-queue-view";

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
  it("does not pull a returned teammate forward across another queue position in 02 / CARD", () => {
    const standby = [
      member("partner", "team-a", 1),
      member("next", "team-b", 2),
      member("returned", "team-a", 3),
    ];

    const groups = groupStandbyCardItems(standby);

    expect(groups.map(group => group.map(item => item.id))).toEqual([
      ["partner"],
      ["next"],
      ["returned"],
    ]);
    expect(groups.flat().map(item => item.id)).toEqual(["partner", "next", "returned"]);
  });

  it("keeps all 02 / CARD Standby positions while pairing only adjacent teammates", () => {
    const dp = { ...member("dp", "team-dp", 4), role: "dp" as const };
    const wk = { ...member("wk", "team-wk", 5), role: "wk" as const };
    const floating = { ...member("floating", "team-floating", 6), role: "floating" as const };
    const shadow = { ...member("shadow", "team-shadow", 7), role: "floating" as const, isShadow: true };
    const state = createQueueState([
      member("a1", "team-a", 1),
      member("b1", "team-b", 2),
      member("a2", "team-a", 3),
      dp,
      wk,
      floating,
      shadow,
    ]);
    state.standby = ["a1", "b1", "a2", "dp", "wk", "floating", "shadow"];

    const items = selectStandbyCardItems(state);

    expect(items.map(item => item.id)).toEqual(["a1", "b1", "a2", "dp", "wk", "shadow"]);
    expect(groupStandbyCardItems(items).map(group => group.map(item => item.id))).toEqual([
      ["a1"],
      ["b1"],
      ["a2"],
      ["dp"],
      ["wk"],
      ["shadow"],
    ]);
  });
});
