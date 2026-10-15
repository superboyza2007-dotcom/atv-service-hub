import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  appDirectoryUsers,
  futureDicePlayers,
  futureDiceRolls,
  futureDiceSessions,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  type FutureDiceMode,
  type FutureDiceOutcomeType,
  type FutureDiceSlot,
  type FutureDiceTeam,
  FutureDiceRuleError,
  assertFutureDicePlayerIds,
  outcomeChoicesForFutureDiceType,
  resolveFutureDiceRolls,
  slotsForFutureDiceMode,
  teamForFutureDiceSlot,
} from "./futureDiceRules";

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type FutureDiceSessionRow = typeof futureDiceSessions.$inferSelect;
type FutureDicePlayerRow = typeof futureDicePlayers.$inferSelect;
type FutureDiceRollRow = typeof futureDiceRolls.$inferSelect;

export type FutureDiceActor = {
  directoryUserId?: number;
  name: string;
  isSupervisor: boolean;
};

export type FutureDiceSessionView = {
  id: number;
  status: "open" | "completed" | "cancelled";
  gameMode: FutureDiceMode;
  outcomeType: FutureDiceOutcomeType;
  currentTurn: number;
  currentPlayer: { id: number; slot: FutureDiceSlot; name: string; directoryUserId: number | null } | null;
  winningTeam: FutureDiceTeam | null;
  selectedOutcome: string | null;
  scores: { A: number; B: number };
  createdByName: string;
  createdAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
  players: Array<{
    id: number;
    slot: FutureDiceSlot;
    team: FutureDiceTeam;
    turnOrder: number;
    name: string;
    directoryUserId: number | null;
    roll: { dieOne: number; dieTwo: number; total: number; rolledAt: Date; rolledByName: string } | null;
  }>;
};

export class FutureDiceServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FutureDiceServiceError";
  }
}

function requireDatabase(db: Database | null): Database {
  if (!db) throw new FutureDiceServiceError("ฐานข้อมูล Future Dice ยังไม่พร้อมใช้งาน");
  return db;
}

function sortPlayers(players: FutureDicePlayerRow[]) {
  return [...players].sort((a, b) => a.turnOrder - b.turnOrder);
}

function toSessionView(session: FutureDiceSessionRow, players: FutureDicePlayerRow[], rolls: FutureDiceRollRow[]): FutureDiceSessionView {
  const orderedPlayers = sortPlayers(players);
  const playerById = new Map(orderedPlayers.map(player => [player.id, player]));
  const rollByPlayerId = new Map(rolls.map(roll => [roll.playerId, roll]));
  const resolution = resolveFutureDiceRolls(
    session.gameMode as FutureDiceMode,
    rolls.flatMap(roll => {
      const player = playerById.get(roll.playerId);
      return player ? [{ slot: player.slot as FutureDiceSlot, dieOne: roll.dieOne, dieTwo: roll.dieTwo }] : [];
    }),
  );
  const currentPlayer = session.status === "open" ? orderedPlayers.find(player => player.turnOrder === session.currentTurn) ?? null : null;

  return {
    id: session.id,
    status: session.status,
    gameMode: session.gameMode as FutureDiceMode,
    outcomeType: session.outcomeType as FutureDiceOutcomeType,
    currentTurn: session.currentTurn,
    currentPlayer: currentPlayer ? {
      id: currentPlayer.id,
      slot: currentPlayer.slot as FutureDiceSlot,
      name: currentPlayer.playerName,
      directoryUserId: currentPlayer.directoryUserId,
    } : null,
    winningTeam: session.winningTeam as FutureDiceTeam | null,
    selectedOutcome: session.selectedOutcome,
    scores: resolution.scores,
    createdByName: session.createdByName,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    updatedAt: session.updatedAt,
    players: orderedPlayers.map(player => {
      const roll = rollByPlayerId.get(player.id);
      return {
        id: player.id,
        slot: player.slot as FutureDiceSlot,
        team: player.team as FutureDiceTeam,
        turnOrder: player.turnOrder,
        name: player.playerName,
        directoryUserId: player.directoryUserId,
        roll: roll ? {
          dieOne: roll.dieOne,
          dieTwo: roll.dieTwo,
          total: roll.total,
          rolledAt: roll.createdAt,
          rolledByName: roll.rolledByName,
        } : null,
      };
    }),
  };
}

async function readFutureDiceSession(db: Database, sessionId: number): Promise<FutureDiceSessionView | undefined> {
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, sessionId)).limit(1))[0];
  if (!session) return undefined;
  const [players, rolls] = await Promise.all([
    db.select().from(futureDicePlayers).where(eq(futureDicePlayers.sessionId, sessionId)).orderBy(asc(futureDicePlayers.turnOrder)),
    db.select().from(futureDiceRolls).where(eq(futureDiceRolls.sessionId, sessionId)).orderBy(asc(futureDiceRolls.turnOrder)),
  ]);
  return toSessionView(session, players, rolls);
}

export async function getFutureDiceSession(sessionId: number): Promise<FutureDiceSessionView | undefined> {
  const db = requireDatabase(await getDb());
  return readFutureDiceSession(db, sessionId);
}

export async function listFutureDiceSessions(limit = 12): Promise<FutureDiceSessionView[]> {
  const db = requireDatabase(await getDb());
  const sessions = await db.select().from(futureDiceSessions)
    .orderBy(desc(futureDiceSessions.updatedAt), desc(futureDiceSessions.id))
    .limit(Math.min(Math.max(Math.floor(limit), 1), 30));
  if (!sessions.length) return [];

  const sessionIds = sessions.map(session => session.id);
  const [players, rolls] = await Promise.all([
    db.select().from(futureDicePlayers).where(inArray(futureDicePlayers.sessionId, sessionIds)).orderBy(asc(futureDicePlayers.turnOrder)),
    db.select().from(futureDiceRolls).where(inArray(futureDiceRolls.sessionId, sessionIds)).orderBy(asc(futureDiceRolls.turnOrder)),
  ]);
  const playersBySession = new Map<number, FutureDicePlayerRow[]>();
  const rollsBySession = new Map<number, FutureDiceRollRow[]>();
  players.forEach(player => playersBySession.set(player.sessionId, [...(playersBySession.get(player.sessionId) ?? []), player]));
  rolls.forEach(roll => rollsBySession.set(roll.sessionId, [...(rollsBySession.get(roll.sessionId) ?? []), roll]));
  return sessions.map(session => toSessionView(session, playersBySession.get(session.id) ?? [], rollsBySession.get(session.id) ?? []));
}

export async function createFutureDiceSession(input: {
  actor: FutureDiceActor;
  gameMode: FutureDiceMode;
  outcomeType: FutureDiceOutcomeType;
  directoryUserIds: number[];
}): Promise<FutureDiceSessionView> {
  assertFutureDicePlayerIds(input.gameMode, input.directoryUserIds);
  const db = requireDatabase(await getDb());
  const directoryPlayers = await db.select({ id: appDirectoryUsers.id, name: appDirectoryUsers.name })
    .from(appDirectoryUsers)
    .where(inArray(appDirectoryUsers.id, input.directoryUserIds));
  const directoryById = new Map(directoryPlayers.map(player => [player.id, player]));
  if (directoryById.size !== input.directoryUserIds.length) {
    throw new FutureDiceServiceError("พบผู้เล่นที่ไม่มีอยู่ในสารบบผู้ใช้งาน");
  }

  const sessionId = await db.transaction(async tx => {
    const result = await tx.insert(futureDiceSessions).values({
      gameMode: input.gameMode,
      outcomeType: input.outcomeType,
      createdByDirectoryUserId: input.actor.directoryUserId ?? null,
      createdByName: input.actor.name.trim() || "ผู้ควบคุมเกม",
    });
    const id = Number(result[0].insertId);
    const slots = slotsForFutureDiceMode(input.gameMode);
    await tx.insert(futureDicePlayers).values(slots.map((slot, turnOrder) => {
      const directoryUserId = input.directoryUserIds[turnOrder]!;
      const player = directoryById.get(directoryUserId)!;
      return {
        sessionId: id,
        directoryUserId,
        playerName: player.name,
        slot,
        team: teamForFutureDiceSlot(slot),
        turnOrder,
      };
    }));
    return id;
  });

  const session = await getFutureDiceSession(sessionId);
  if (!session) throw new FutureDiceServiceError("ไม่พบเกมที่สร้างใหม่");
  return session;
}

export async function rollFutureDice(input: {
  sessionId: number;
  actor: FutureDiceActor;
}): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  await db.transaction(async tx => {
    const session = (await tx.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
    if (!session) throw new FutureDiceServiceError("ไม่พบเกมที่เลือก");
    if (session.status !== "open") throw new FutureDiceServiceError("เกมนี้ปิดการทอยแล้ว");

    const players = await tx.select().from(futureDicePlayers)
      .where(eq(futureDicePlayers.sessionId, input.sessionId))
      .orderBy(asc(futureDicePlayers.turnOrder));
    const currentPlayer = players.find(player => player.turnOrder === session.currentTurn);
    if (!currentPlayer) throw new FutureDiceServiceError("ไม่พบผู้เล่นในเทิร์นปัจจุบัน");
    if (!input.actor.isSupervisor && currentPlayer.directoryUserId !== input.actor.directoryUserId) {
      throw new FutureDiceServiceError("ยังไม่ถึงสิทธิ์ทอยของผู้ใช้งานนี้");
    }

    const existingRolls = await tx.select().from(futureDiceRolls)
      .where(eq(futureDiceRolls.sessionId, input.sessionId))
      .orderBy(asc(futureDiceRolls.turnOrder));
    const dieOne = randomInt(1, 7);
    const dieTwo = randomInt(1, 7);
    const resolution = resolveFutureDiceRolls(
      session.gameMode as FutureDiceMode,
      [
        ...existingRolls.flatMap(roll => {
          const player = players.find(item => item.id === roll.playerId);
          return player ? [{ slot: player.slot as FutureDiceSlot, dieOne: roll.dieOne, dieTwo: roll.dieTwo }] : [];
        }),
        { slot: currentPlayer.slot as FutureDiceSlot, dieOne, dieTwo },
      ],
    );
    const nextTurn = session.currentTurn + 1;
    const update = await tx.update(futureDiceSessions).set(
      resolution.complete ? {
        status: "completed",
        currentTurn: nextTurn,
        winningTeam: resolution.winningTeam,
        completedAt: new Date(),
      } : { currentTurn: nextTurn },
    ).where(and(
      eq(futureDiceSessions.id, input.sessionId),
      eq(futureDiceSessions.status, "open"),
      eq(futureDiceSessions.currentTurn, session.currentTurn),
    ));
    if (Number(update[0].affectedRows ?? 0) !== 1) {
      throw new FutureDiceServiceError("มีการทอยจากอีกอุปกรณ์หนึ่งแล้ว กรุณารีเฟรชข้อมูล");
    }
    await tx.insert(futureDiceRolls).values({
      sessionId: input.sessionId,
      playerId: currentPlayer.id,
      turnOrder: currentPlayer.turnOrder,
      dieOne,
      dieTwo,
      total: dieOne + dieTwo,
      rolledByDirectoryUserId: input.actor.directoryUserId ?? null,
      rolledByName: input.actor.name.trim() || "ผู้ควบคุมเกม",
    });
  });

  const session = await getFutureDiceSession(input.sessionId);
  if (!session) throw new FutureDiceServiceError("ไม่พบเกมหลังบันทึกผลทอย");
  return session;
}

export async function chooseFutureDiceOutcome(input: {
  sessionId: number;
  selectedOutcome: string;
}): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
  if (!session) throw new FutureDiceServiceError("ไม่พบเกมที่เลือก");
  if (session.status !== "completed") throw new FutureDiceServiceError("เลือกผลลัพธ์ได้เมื่อจบเกมแล้วเท่านั้น");
  if (!session.winningTeam) throw new FutureDiceServiceError("เกมเสมอ จึงไม่มีทีมชนะเพื่อเลือกผลลัพธ์");
  const choices = outcomeChoicesForFutureDiceType(session.outcomeType as FutureDiceOutcomeType);
  if (!choices.includes(input.selectedOutcome)) throw new FutureDiceServiceError("ผลลัพธ์ที่เลือกไม่ตรงกับรูปแบบของเกม");

  await db.update(futureDiceSessions).set({ selectedOutcome: input.selectedOutcome })
    .where(and(eq(futureDiceSessions.id, input.sessionId), eq(futureDiceSessions.status, "completed")));
  const updated = await getFutureDiceSession(input.sessionId);
  if (!updated) throw new FutureDiceServiceError("ไม่พบเกมหลังบันทึกผลลัพธ์");
  return updated;
}

export async function setFutureDiceOutcomeType(input: {
  sessionId: number;
  outcomeType: FutureDiceOutcomeType;
}): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
  if (!session || session.status === "cancelled") throw new FutureDiceServiceError("ไม่พบเกมที่กำลังแก้ไข");
  await db.update(futureDiceSessions).set({ outcomeType: input.outcomeType, selectedOutcome: null })
    .where(eq(futureDiceSessions.id, input.sessionId));
  const updated = await getFutureDiceSession(input.sessionId);
  if (!updated) throw new FutureDiceServiceError("ไม่พบเกมหลังบันทึกรูปแบบผลลัพธ์");
  return updated;
}

export async function cancelFutureDiceSession(sessionId: number): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  const update = await db.update(futureDiceSessions).set({ status: "cancelled", completedAt: new Date() })
    .where(and(eq(futureDiceSessions.id, sessionId), eq(futureDiceSessions.status, "open")));
  if (Number(update[0].affectedRows ?? 0) !== 1) {
    throw new FutureDiceServiceError("ยกเลิกได้เฉพาะเกมที่กำลังดำเนินอยู่");
  }
  const session = await getFutureDiceSession(sessionId);
  if (!session) throw new FutureDiceServiceError("ไม่พบเกมหลังยกเลิก");
  return session;
}

export function isFutureDiceRuleError(error: unknown): error is FutureDiceRuleError | FutureDiceServiceError {
  return error instanceof FutureDiceRuleError || error instanceof FutureDiceServiceError;
}
