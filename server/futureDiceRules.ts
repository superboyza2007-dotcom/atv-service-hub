export const FUTURE_DICE_MODE_VALUES = ["one_vs_one", "two_vs_two"] as const;
export type FutureDiceMode = (typeof FUTURE_DICE_MODE_VALUES)[number];

export const FUTURE_DICE_OUTCOME_TYPE_VALUES = ["minutes", "go_no_go"] as const;
export type FutureDiceOutcomeType = (typeof FUTURE_DICE_OUTCOME_TYPE_VALUES)[number];

export const FUTURE_DICE_TEAM_VALUES = ["A", "B"] as const;
export type FutureDiceTeam = (typeof FUTURE_DICE_TEAM_VALUES)[number];

export const FUTURE_DICE_SLOT_VALUES = ["A1", "B1", "A2", "B2"] as const;
export type FutureDiceSlot = (typeof FUTURE_DICE_SLOT_VALUES)[number];

export type FutureDiceRollLike = {
  slot: FutureDiceSlot;
  dieOne: number;
  dieTwo: number;
};

export class FutureDiceRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FutureDiceRuleError";
  }
}

export function slotsForFutureDiceMode(mode: FutureDiceMode): FutureDiceSlot[] {
  return mode === "one_vs_one" ? ["A1", "B1"] : ["A1", "B1", "A2", "B2"];
}

export function teamForFutureDiceSlot(slot: FutureDiceSlot): FutureDiceTeam {
  return slot.startsWith("A") ? "A" : "B";
}

export function canRollFutureDice(input: {
  actorDirectoryUserId?: number;
  targetDirectoryUserId: number | null;
  targetOnline: boolean;
  actorTeam?: FutureDiceTeam;
  targetTeam: FutureDiceTeam;
}): boolean {
  if (input.actorDirectoryUserId == null || input.targetDirectoryUserId == null) return false;
  if (input.actorDirectoryUserId === input.targetDirectoryUserId) return true;
  return !input.targetOnline && input.actorTeam === input.targetTeam;
}

export function canChooseFutureDiceOutcome(input: {
  actorDirectoryUserId?: number;
  winningTeam: FutureDiceTeam | null;
  players: Array<{ directoryUserId: number | null; team: FutureDiceTeam }>;
}): boolean {
  return input.actorDirectoryUserId != null && input.winningTeam != null
    && input.players.some(player => player.team === input.winningTeam && player.directoryUserId === input.actorDirectoryUserId);
}

export function outcomeChoicesForFutureDiceType(outcomeType: FutureDiceOutcomeType): string[] {
  return outcomeType === "minutes" ? ["30", "60"] : ["ไป", "ไม่ไป"];
}

export function assertFutureDicePlayerIds(mode: FutureDiceMode, directoryUserIds: number[]): void {
  const slots = slotsForFutureDiceMode(mode);
  if (directoryUserIds.length !== slots.length) {
    throw new FutureDiceRuleError(mode === "one_vs_one" ? "โหมด 1v1 ต้องเลือกผู้เล่น 2 คน" : "โหมด 2v2 ต้องเลือกผู้เล่น 4 คน");
  }
  if (directoryUserIds.some(id => !Number.isInteger(id) || id <= 0)) {
    throw new FutureDiceRuleError("ผู้เล่นที่เลือกไม่ถูกต้อง");
  }
  if (new Set(directoryUserIds).size !== directoryUserIds.length) {
    throw new FutureDiceRuleError("ผู้เล่นหนึ่งคนเลือกซ้ำในเกมเดียวกันไม่ได้");
  }
}

export function assertDiceValues(dieOne: number, dieTwo: number): void {
  if (!Number.isInteger(dieOne) || !Number.isInteger(dieTwo) || dieOne < 1 || dieOne > 6 || dieTwo < 1 || dieTwo > 6) {
    throw new FutureDiceRuleError("ผลลูกเต๋าต้องเป็นจำนวนเต็มระหว่าง 1 ถึง 6");
  }
}

export type FutureDiceScore = {
  A: number;
  B: number;
};

export type FutureDiceResolution = {
  complete: boolean;
  scores: FutureDiceScore;
  winningTeam: FutureDiceTeam | null;
};

export function resolveFutureDiceRolls(mode: FutureDiceMode, rolls: FutureDiceRollLike[]): FutureDiceResolution {
  const slots = slotsForFutureDiceMode(mode);
  const expectedSlots = new Set(slots);
  const seenSlots = new Set<FutureDiceSlot>();
  const scores: FutureDiceScore = { A: 0, B: 0 };

  for (const roll of rolls) {
    if (!expectedSlots.has(roll.slot)) throw new FutureDiceRuleError("พบตำแหน่งผู้เล่นที่ไม่อยู่ในโหมดเกมนี้");
    if (seenSlots.has(roll.slot)) throw new FutureDiceRuleError("ผู้เล่นแต่ละตำแหน่งทอยได้เพียงครั้งเดียว");
    assertDiceValues(roll.dieOne, roll.dieTwo);
    seenSlots.add(roll.slot);
    scores[teamForFutureDiceSlot(roll.slot)] += roll.dieOne + roll.dieTwo;
  }

  if (seenSlots.size !== slots.length) {
    return { complete: false, scores, winningTeam: null };
  }
  if (scores.A === scores.B) {
    return { complete: true, scores, winningTeam: null };
  }
  return { complete: true, scores, winningTeam: scores.A > scores.B ? "A" : "B" };
}
