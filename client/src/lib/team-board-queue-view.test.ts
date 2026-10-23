import { describe, expect, it } from "vitest";
import { createQueueState, normalizeStandbyTeamPairs, type BoardMember } from "./team-board-queue-engine";
import { groupStandbyCardItems, mergeStandbyIdsPreservingQueue, selectStandbyCardItems } from "./team-board-queue-view";

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

  it("returns a late teammate to the first teammate's existing queue position", () => {
    const boy = { ...member("boy", "team-boy-por", 2), partnerId: "por" };
    const por = { ...member("por", "team-boy-por", 5), partnerId: "boy" };
    const nextTeam = { ...member("next-team", "team-next", 3), partnerId: "next-team-2" };
    const nextTeam2 = { ...member("next-team-2", "team-next", 4), partnerId: "next-team" };
    const state = createQueueState([boy, nextTeam, nextTeam2, por]);
    state.standby = ["boy", "next-team", "next-team-2", "por"];

    const normalized = normalizeStandbyTeamPairs(state);

    expect(normalized.standby).toEqual(["boy", "por", "next-team", "next-team-2"]);
  });

  it("does not reunite a pair until both members are normal Te-", () => {
    const boy = { ...member("boy", "team-boy-por", 2), partnerId: "por" };
    const por = { ...member("por", "team-boy-por", 5), partnerId: "boy", role: "dp" as const, underRound: true };
    const state = createQueueState([boy, por]);
    state.standby = ["boy", "por"];

    expect(normalizeStandbyTeamPairs(state).standby).toEqual(["boy", "por"]);
  });

  it("keeps unrelated queue members when the 2.3 Standby feed contains only part of the roster", () => {
    expect(mergeStandbyIdsPreservingQueue(["a", "b", "c"], ["c"], new Set(["a"]))).toEqual(["b", "c"]);
    expect(mergeStandbyIdsPreservingQueue(["b", "c"], ["a", "c"], new Set(["c"]))).toEqual(["b", "a"]);
  });
});
