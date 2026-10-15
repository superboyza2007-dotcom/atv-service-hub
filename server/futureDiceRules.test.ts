import { describe, expect, it } from "vitest";
import {
  FutureDiceRuleError,
  assertFutureDicePlayerIds,
  outcomeChoicesForFutureDiceType,
  resolveFutureDiceRolls,
  slotsForFutureDiceMode,
} from "./futureDiceRules";

describe("Future Dice rules", () => {
  it("uses a fixed alternating order for each game mode", () => {
    expect(slotsForFutureDiceMode("one_vs_one")).toEqual(["A1", "B1"]);
    expect(slotsForFutureDiceMode("two_vs_two")).toEqual(["A1", "B1", "A2", "B2"]);
  });

  it("requires the exact number of distinct directory players", () => {
    expect(() => assertFutureDicePlayerIds("one_vs_one", [1, 2])).not.toThrow();
    expect(() => assertFutureDicePlayerIds("two_vs_two", [1, 2, 3, 4])).not.toThrow();
    expect(() => assertFutureDicePlayerIds("one_vs_one", [1])).toThrow(FutureDiceRuleError);
    expect(() => assertFutureDicePlayerIds("two_vs_two", [1, 2, 2, 4])).toThrow("เลือกซ้ำ");
  });

  it("does not resolve a winner until every assigned slot has rolled", () => {
    expect(resolveFutureDiceRolls("two_vs_two", [
      { slot: "A1", dieOne: 6, dieTwo: 6 },
      { slot: "B1", dieOne: 1, dieTwo: 1 },
    ])).toEqual({ complete: false, scores: { A: 12, B: 2 }, winningTeam: null });
  });

  it("calculates team scores server-side and identifies the winner", () => {
    expect(resolveFutureDiceRolls("two_vs_two", [
      { slot: "A1", dieOne: 6, dieTwo: 4 },
      { slot: "B1", dieOne: 2, dieTwo: 2 },
      { slot: "A2", dieOne: 5, dieTwo: 3 },
      { slot: "B2", dieOne: 4, dieTwo: 3 },
    ])).toEqual({ complete: true, scores: { A: 18, B: 11 }, winningTeam: "A" });
  });

  it("records a completed tie without inventing a winner", () => {
    expect(resolveFutureDiceRolls("one_vs_one", [
      { slot: "A1", dieOne: 3, dieTwo: 4 },
      { slot: "B1", dieOne: 5, dieTwo: 2 },
    ])).toEqual({ complete: true, scores: { A: 7, B: 7 }, winningTeam: null });
  });

  it("rejects invalid and duplicate rolls", () => {
    expect(() => resolveFutureDiceRolls("one_vs_one", [
      { slot: "A1", dieOne: 7, dieTwo: 1 },
    ])).toThrow("1 ถึง 6");
    expect(() => resolveFutureDiceRolls("one_vs_one", [
      { slot: "A1", dieOne: 1, dieTwo: 1 },
      { slot: "A1", dieOne: 2, dieTwo: 2 },
    ])).toThrow("เพียงครั้งเดียว");
  });

  it("exposes only outcomes that match the selected result mode", () => {
    expect(outcomeChoicesForFutureDiceType("minutes")).toEqual(["30", "60"]);
    expect(outcomeChoicesForFutureDiceType("go_no_go")).toEqual(["ไป", "ไม่ไป"]);
  });
});
