import { randomInt } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import {
  appDirectoryUsers,
  futureDicePlayers,
  futureDiceRolls,
  futureDiceSessions,
} from "../drizzle/schema";
import { getDb, getOnlineAppDirectoryUserIds } from "./db";
import {
  type FutureDiceMode,
  type FutureDiceOutcomeType,
  type FutureDiceSlot,
  type FutureDiceTeam,
  FutureDiceRuleError,
  assertFutureDicePlayerIds,
  canChooseFutureDiceOutcome,
  canRollFutureDice,
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
  currentRound: number;
  currentPlayer: {
    id: number;
    slot: FutureDiceSlot;
    team: FutureDiceTeam;
    name: string;
    directoryUserId: number | null;
    isOnline: boolean;
  } | null;
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
    isOnline: boolean;
    rolls: Array<{
      round: number;
      dieOne: number;
      dieTwo: number;
      total: number;
      rolledAt: Date;
      rolledByName: string;
    }>;
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

function toSessionView(
  session: FutureDiceSessionRow,
  players: FutureDicePlayerRow[],
  rolls: FutureDiceRollRow[],
  onlineUserIds: Set<number>,
): FutureDiceSessionView {
  const orderedPlayers = sortPlayers(players);
  const roundRolls = rolls.filter(roll => roll.round === session.currentRound);
  const resolution = resolveFutureDiceRolls(
    session.gameMode as FutureDiceMode,
    roundRolls.flatMap(roll => {
      const player = orderedPlayers.find(item => item.id === roll.playerId);
      return player ? [{ slot: player.slot as FutureDiceSlot, dieOne: roll.dieOne, dieTwo: roll.dieTwo }] : [];
    }),
  );
  const playerView = orderedPlayers.map(player => ({
    id: player.id,
    slot: player.slot as FutureDiceSlot,
    team: player.team as FutureDiceTeam,
    turnOrder: player.turnOrder,
    name: player.playerName,
    directoryUserId: player.directoryUserId,
    isOnline: player.directoryUserId != null && onlineUserIds.has(Number(player.directoryUserId)),
    rolls: rolls.filter(roll => roll.playerId === player.id).map(roll => ({
      round: roll.round,
      dieOne: roll.dieOne,
      dieTwo: roll.dieTwo,
      total: roll.total,
      rolledAt: roll.createdAt,
      rolledByName: roll.rolledByName,
    })),
  }));
  const currentPlayerRow = session.status === "open"
    ? orderedPlayers.find(player => player.turnOrder === session.currentTurn) ?? null
    : null;
  const currentPlayer = currentPlayerRow
    ? playerView.find(player => player.id === currentPlayerRow.id) ?? null
    : null;

  return {
    id: session.id,
    status: session.status,
    gameMode: session.gameMode as FutureDiceMode,
    outcomeType: session.outcomeType as FutureDiceOutcomeType,
    currentTurn: session.currentTurn,
    currentRound: session.currentRound,
    currentPlayer: currentPlayer ? {
      id: currentPlayer.id,
      slot: currentPlayer.slot,
      team: currentPlayer.team,
      name: currentPlayer.name,
      directoryUserId: currentPlayer.directoryUserId,
      isOnline: currentPlayer.isOnline,
    } : null,
    winningTeam: session.winningTeam as FutureDiceTeam | null,
    selectedOutcome: session.selectedOutcome,
    scores: resolution.scores,
    createdByName: session.createdByName,
    createdAt: session.createdAt,
    completedAt: session.completedAt,
    updatedAt: session.updatedAt,
    players: playerView,
  };
}

async function readFutureDiceSession(db: Database, sessionId: number): Promise<FutureDiceSessionView | undefined> {
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, sessionId)).limit(1))[0];
  if (!session) return undefined;
  const [players, rolls, onlineUserIds] = await Promise.all([
    db.select().from(futureDicePlayers).where(eq(futureDicePlayers.sessionId, sessionId)).orderBy(asc(futureDicePlayers.turnOrder)),
    db.select().from(futureDiceRolls).where(eq(futureDiceRolls.sessionId, sessionId)).orderBy(asc(futureDiceRolls.round), asc(futureDiceRolls.turnOrder)),
    getOnlineAppDirectoryUserIds(),
  ]);
  return toSessionView(session, players, rolls, onlineUserIds);
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
  const [players, rolls, onlineUserIds] = await Promise.all([
    db.select().from(futureDicePlayers).where(inArray(futureDicePlayers.sessionId, sessionIds)).orderBy(asc(futureDicePlayers.turnOrder)),
    db.select().from(futureDiceRolls).where(inArray(futureDiceRolls.sessionId, sessionIds)).orderBy(asc(futureDiceRolls.round), asc(futureDiceRolls.turnOrder)),
    getOnlineAppDirectoryUserIds(),
  ]);
  const playersBySession = new Map<number, FutureDicePlayerRow[]>();
  const rollsBySession = new Map<number, FutureDiceRollRow[]>();
  players.forEach(player => playersBySession.set(player.sessionId, [...(playersBySession.get(player.sessionId) ?? []), player]));
  rolls.forEach(roll => rollsBySession.set(roll.sessionId, [...(rollsBySession.get(roll.sessionId) ?? []), roll]));
  return sessions.map(session => toSessionView(
    session,
    playersBySession.get(session.id) ?? [],
    rollsBySession.get(session.id) ?? [],
    onlineUserIds,
  ));
}

export async function createFutureDiceSession(input: {
  actor: FutureDiceActor;
  gameMode: FutureDiceMode;
  outcomeType: FutureDiceOutcomeType;
  directoryUserIds: number[];
}): Promise<FutureDiceSessionView> {
  assertFutureDicePlayerIds(input.gameMode, input.directoryUserIds);
  const db = requireDatabase(await getDb());
  const unfinishedSessions = await db.select({ id: futureDiceSessions.id }).from(futureDiceSessions)
    .where(or(
      eq(futureDiceSessions.status, "open"),
      and(eq(futureDiceSessions.status, "completed"), isNull(futureDiceSessions.selectedOutcome), isNotNull(futureDiceSessions.winningTeam)),
    )).limit(1);
  if (unfinishedSessions.length) throw new FutureDiceServiceError("มี Session ที่ยังดำเนินอยู่หรือรอผู้ชนะเลือกผลอยู่แล้ว");
  const [directoryPlayers, onlineUserIds] = await Promise.all([
    db.select({ id: appDirectoryUsers.id, name: appDirectoryUsers.name })
      .from(appDirectoryUsers)
      .where(inArray(appDirectoryUsers.id, input.directoryUserIds)),
    getOnlineAppDirectoryUserIds(),
  ]);
  const directoryById = new Map(directoryPlayers.map(player => [Number(player.id), player]));
  if (directoryById.size !== input.directoryUserIds.length) {
    throw new FutureDiceServiceError("พบผู้เล่นที่ไม่มีอยู่ในสารบบผู้ใช้งาน");
  }
  const slots = slotsForFutureDiceMode(input.gameMode);
  if (input.gameMode === "two_vs_two") {
    for (const team of ["A", "B"] as const) {
      const teamHasOnlinePlayer = slots.some((slot, turnOrder) =>
        teamForFutureDiceSlot(slot) === team && onlineUserIds.has(input.directoryUserIds[turnOrder]!),
      );
      if (!teamHasOnlinePlayer) throw new FutureDiceServiceError(`ทีม ${team} ต้องมีผู้เล่นออนไลน์อย่างน้อย 1 คนจึงเริ่มได้`);
    }
  }

  const sessionId = await db.transaction(async tx => {
    const result = await tx.insert(futureDiceSessions).values({
      gameMode: input.gameMode,
      outcomeType: input.outcomeType,
      createdByDirectoryUserId: input.actor.directoryUserId ?? null,
      createdByName: input.actor.name.trim() || "ผู้ควบคุมเกม",
    });
    const id = Number(result[0].insertId);
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
  const onlineUserIds = await getOnlineAppDirectoryUserIds();
  await db.transaction(async tx => {
    const session = (await tx.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
    if (!session) throw new FutureDiceServiceError("ไม่พบเกมที่เลือก");
    if (session.status !== "open") throw new FutureDiceServiceError("เกมนี้ปิดการทอยแล้ว");

    const players = await tx.select().from(futureDicePlayers)
      .where(eq(futureDicePlayers.sessionId, input.sessionId))
      .orderBy(asc(futureDicePlayers.turnOrder));
    const currentPlayer = players.find(player => player.turnOrder === session.currentTurn);
    if (!currentPlayer) throw new FutureDiceServiceError("ไม่พบผู้เล่นในเทิร์นปัจจุบัน");
    const actorPlayer = players.find(player => input.actor.directoryUserId != null && Number(player.directoryUserId) === input.actor.directoryUserId);
    const targetTeam = currentPlayer.team as FutureDiceTeam;
    const targetOnline = currentPlayer.directoryUserId != null && onlineUserIds.has(Number(currentPlayer.directoryUserId));
    if (!canRollFutureDice({
      actorDirectoryUserId: input.actor.directoryUserId,
      targetDirectoryUserId: currentPlayer.directoryUserId,
      targetOnline,
      actorTeam: actorPlayer?.team as FutureDiceTeam | undefined,
      targetTeam,
    })) {
      throw new FutureDiceServiceError(targetOnline
        ? "ผู้เล่นถึงตาออนไลน์อยู่ ให้ผู้เล่นคนนั้นกดทอยเอง"
        : "ทอยได้เฉพาะผู้เล่นที่ถึงตา หรือสมาชิกทีมเดียวกันที่ทอยแทนผู้เล่นออฟไลน์");
    }

    const existingRolls = await tx.select().from(futureDiceRolls)
      .where(and(eq(futureDiceRolls.sessionId, input.sessionId), eq(futureDiceRolls.round, session.currentRound)))
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
      resolution.complete && resolution.winningTeam
        ? { status: "completed", currentTurn: nextTurn, winningTeam: resolution.winningTeam, completedAt: new Date() }
        : resolution.complete
          ? { currentTurn: 0, currentRound: session.currentRound + 1, winningTeam: null }
          : { currentTurn: nextTurn },
    ).where(and(
      eq(futureDiceSessions.id, input.sessionId),
      eq(futureDiceSessions.status, "open"),
      eq(futureDiceSessions.currentRound, session.currentRound),
      eq(futureDiceSessions.currentTurn, session.currentTurn),
    ));
    if (Number(update[0].affectedRows ?? 0) !== 1) {
      throw new FutureDiceServiceError("มีการทอยจากอีกอุปกรณ์หนึ่งแล้ว กรุณารีเฟรชข้อมูล");
    }
    await tx.insert(futureDiceRolls).values({
      sessionId: input.sessionId,
      round: session.currentRound,
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
  actor: FutureDiceActor;
}): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
  if (!session) throw new FutureDiceServiceError("ไม่พบเกมที่เลือก");
  if (session.status !== "completed") throw new FutureDiceServiceError("เลือกผลลัพธ์ได้เมื่อจบเกมแล้วเท่านั้น");
  if (!session.winningTeam) throw new FutureDiceServiceError("เกมนี้ยังไม่มีทีมชนะเพื่อเลือกผลลัพธ์");
  const players = await db.select({ directoryUserId: futureDicePlayers.directoryUserId, team: futureDicePlayers.team })
    .from(futureDicePlayers).where(eq(futureDicePlayers.sessionId, input.sessionId));
  if (!canChooseFutureDiceOutcome({
    actorDirectoryUserId: input.actor.directoryUserId,
    winningTeam: session.winningTeam as FutureDiceTeam,
    players: players.map(player => ({ directoryUserId: player.directoryUserId, team: player.team as FutureDiceTeam })),
  })) {
    throw new FutureDiceServiceError("เลือกผลได้เฉพาะผู้ชนะหรือสมาชิกทีมผู้ชนะเท่านั้น");
  }
  const choices = outcomeChoicesForFutureDiceType(session.outcomeType as FutureDiceOutcomeType);
  if (!choices.includes(input.selectedOutcome)) throw new FutureDiceServiceError("ผลลัพธ์ที่เลือกไม่ตรงกับรูปแบบของเกม");
  if (session.selectedOutcome != null) throw new FutureDiceServiceError("เกมนี้ประกาศผลลัพธ์ไปแล้ว");

  const updated = await db.update(futureDiceSessions).set({ selectedOutcome: input.selectedOutcome })
    .where(and(eq(futureDiceSessions.id, input.sessionId), eq(futureDiceSessions.status, "completed"), isNull(futureDiceSessions.selectedOutcome)));
  if (Number(updated[0].affectedRows ?? 0) !== 1) throw new FutureDiceServiceError("มีผู้เลือกผลลัพธ์จากอีกอุปกรณ์หนึ่งแล้ว");
  const view = await getFutureDiceSession(input.sessionId);
  if (!view) throw new FutureDiceServiceError("ไม่พบเกมหลังบันทึกผลลัพธ์");
  return view;
}

export async function setFutureDiceOutcomeType(input: {
  sessionId: number;
  outcomeType: FutureDiceOutcomeType;
}): Promise<FutureDiceSessionView> {
  const db = requireDatabase(await getDb());
  const session = (await db.select().from(futureDiceSessions).where(eq(futureDiceSessions.id, input.sessionId)).limit(1))[0];
  if (!session || session.status !== "open") throw new FutureDiceServiceError("ไม่พบเกมที่กำลังแก้ไข");
  const rolls = await db.select({ id: futureDiceRolls.id }).from(futureDiceRolls).where(eq(futureDiceRolls.sessionId, input.sessionId)).limit(1);
  if (rolls.length) throw new FutureDiceServiceError("เปลี่ยนประเภทผลลัพธ์หลังเริ่มทอยไม่ได้");
  await db.update(futureDiceSessions).set({ outcomeType: input.outcomeType })
    .where(and(eq(futureDiceSessions.id, input.sessionId), eq(futureDiceSessions.status, "open")));
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
