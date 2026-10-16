import { and, desc, eq, gte, notInArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { AppDirectoryUser, InsertAppDirectoryUser, InsertUser, appDirectoryPresence, appDirectoryUsers, appLiveMessages, appOperationalHistory, appOperationsSnapshots, users } from "../drizzle/schema";
import { ENV } from './_core/env';
import { directoryCredentialFields, hashDirectoryCode, hashMatches } from './appDirectoryAuth';
import { APP_DIRECTORY_ONLINE_WINDOW_MS } from "./appDirectoryPresence";

let _db: ReturnType<typeof drizzle> | null = null;

function normalizeDirectoryName(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function listAppDirectoryUsers(): Promise<AppDirectoryUser[]> {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appDirectoryUsers).orderBy(appDirectoryUsers.id);
}

export async function getAppDirectoryUserByCode(rawCode: string): Promise<AppDirectoryUser | undefined> {
  const code = rawCode.trim().toLowerCase();
  if (!code) return undefined;
  const users = await listAppDirectoryUsers();
  return users.find(user => user.code?.trim().toLowerCase() === code);
}

export async function getAppDirectoryUserById(id: number): Promise<AppDirectoryUser | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(appDirectoryUsers).where(eq(appDirectoryUsers.id, id)).limit(1);
  return result[0];
}

export async function touchAppDirectoryPresence(directoryUserId: number, lastSeenAt = new Date()): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(appDirectoryPresence).values({ directoryUserId, lastSeenAt })
    .onDuplicateKeyUpdate({ set: { lastSeenAt } });
}

export async function getOnlineAppDirectoryUserIds(now = Date.now()): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const cutoff = new Date(now - APP_DIRECTORY_ONLINE_WINDOW_MS);
  const rows = await db.select({ directoryUserId: appDirectoryPresence.directoryUserId })
    .from(appDirectoryPresence)
    .where(gte(appDirectoryPresence.lastSeenAt, cutoff));
  return new Set(rows.map(row => Number(row.directoryUserId)));
}

export async function setAppDirectoryCodeHash(id: number, codeHash: string, codeSalt: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(appDirectoryUsers).set({ codeHash, codeSalt }).where(eq(appDirectoryUsers.id, id));
}

export async function upsertAppDirectoryUser(input: InsertAppDirectoryUser): Promise<AppDirectoryUser> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingUsers = await listAppDirectoryUsers();
  const normalizedName = normalizeDirectoryName(input.name);
  if (existingUsers.some(user => user.id !== input.id && normalizeDirectoryName(user.name) === normalizedName)) {
    throw new Error("ชื่อนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น");
  }
  const normalizedCode = input.code?.trim() ?? "";
  if (!normalizedCode) throw new Error("Directory code is required");
  const hashed = hashDirectoryCode(normalizedCode);
  const values: InsertAppDirectoryUser = {
    ...input,
    name: input.name.trim(),
    code: null,
    codeHash: hashed.hash,
    codeSalt: hashed.salt,
    userGroup: input.userGroup.trim(),
  };
  await db.insert(appDirectoryUsers).values(values).onDuplicateKeyUpdate({
    set: { name: values.name, code: values.code, codeHash: values.codeHash, codeSalt: values.codeSalt, userGroup: values.userGroup },
  });
  const saved = values.id ? await getAppDirectoryUserById(values.id) : (await listAppDirectoryUsers()).find(user => user.name === values.name && user.userGroup === values.userGroup && user.codeHash === values.codeHash);
  if (!saved) throw new Error("Unable to save app directory user");
  return saved;
}

/** Replace the code-based directory atomically; the submitted array is the canonical full directory. */
export async function replaceAppDirectoryUsers(inputs: InsertAppDirectoryUser[]): Promise<AppDirectoryUser[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingRows = await listAppDirectoryUsers();
  // MySQL drivers may expose an integer id as a number or a numeric string depending on connection settings.
  // Normalize both sides so a server-returned existing row preserves its hash when the client omits plaintext code.
  const existingById = new Map(existingRows.map(user => [String(user.id), user]));
  const normalized = inputs.map(input => {
    const suppliedCode = input.code?.trim() ?? "";
    const existing = input.id != null ? existingById.get(String(input.id)) : undefined;
    const credentials = directoryCredentialFields(suppliedCode, existing);
    return {
      ...input,
      name: input.name.trim(),
      ...credentials,
      userGroup: input.userGroup.trim(),
    };
  });
  const seenNames = new Set<string>();
  for (const user of normalized) {
    const nameKey = normalizeDirectoryName(user.name);
    if (seenNames.has(nameKey)) throw new Error("ชื่อนี้มีอยู่แล้ว กรุณาใช้ชื่ออื่น");
    seenNames.add(nameKey);
  }
  const persistedIds = normalized.flatMap(input => input.id != null && Number.isInteger(Number(input.id)) ? [Number(input.id)] : []);
  await db.transaction(async tx => {
    if (persistedIds.length) {
      await tx.delete(appDirectoryUsers).where(notInArray(appDirectoryUsers.id, persistedIds));
    } else {
      await tx.delete(appDirectoryUsers);
    }
    for (const values of normalized) {
      await tx.insert(appDirectoryUsers).values(values).onDuplicateKeyUpdate({
        set: { name: values.name, code: values.code, codeHash: values.codeHash, codeSalt: values.codeSalt, userGroup: values.userGroup },
      });
    }
  });
  return listAppDirectoryUsers();
}

export async function getAppOperationsSnapshot(snapshotKey: string): Promise<string | undefined> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select({ payload: appOperationsSnapshots.payload }).from(appOperationsSnapshots).where(eq(appOperationsSnapshots.snapshotKey, snapshotKey)).limit(1);
  return rows[0]?.payload;
}

const TEAM_BOARD_ACCESS_SNAPSHOT_KEY = "atv-team-board-access-v1";
const DEFAULT_TEAM_BOARD_ACCESS_CODE = "123456";

type TeamBoardAccessRecord = { hash: string; salt: string };

async function getTeamBoardAccessRecord(): Promise<TeamBoardAccessRecord> {
  const current = parseSnapshotRecord(await getAppOperationsSnapshot(TEAM_BOARD_ACCESS_SNAPSHOT_KEY));
  if (typeof current.hash === "string" && typeof current.salt === "string") {
    return { hash: current.hash, salt: current.salt };
  }
  const initial = hashDirectoryCode(DEFAULT_TEAM_BOARD_ACCESS_CODE);
  await upsertAppOperationsSnapshot(TEAM_BOARD_ACCESS_SNAPSHOT_KEY, JSON.stringify(initial));
  return initial;
}

export async function verifyTeamBoardAccessCode(rawCode: string): Promise<boolean> {
  const record = await getTeamBoardAccessRecord();
  return hashMatches(rawCode, record.hash, record.salt);
}

export async function changeTeamBoardAccessCode(currentCode: string, nextCode: string): Promise<boolean> {
  const record = await getTeamBoardAccessRecord();
  if (!hashMatches(currentCode, record.hash, record.salt)) return false;
  const next = hashDirectoryCode(nextCode);
  await upsertAppOperationsSnapshot(TEAM_BOARD_ACCESS_SNAPSHOT_KEY, JSON.stringify(next));
  return true;
}

export async function upsertAppOperationsSnapshot(snapshotKey: string, payload: string): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(appOperationsSnapshots).values({ snapshotKey, payload }).onDuplicateKeyUpdate({ set: { payload } });
  const saved = await db.select({ payload: appOperationsSnapshots.payload }).from(appOperationsSnapshots).where(eq(appOperationsSnapshots.snapshotKey, snapshotKey)).limit(1);
  if (saved[0]?.payload !== payload) throw new Error("Unable to verify saved operations snapshot");
}

function parseSnapshotRecord(payload: string | undefined): Record<string, unknown> {
  if (!payload) return {};
  try {
    const parsed = JSON.parse(payload) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

const GUIDE_REPAIR_SNAPSHOT_KEYS = new Set([
  "atv-guide-sessions-v1",
  "atv-guide-state-v1",
]);

function isTerminalGuideRepairReport(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const report = value as { status?: unknown; completedAt?: unknown };
  return report.status === "ซ่อมเสร็จ" || typeof report.completedAt === "string";
}

export function mergeGuideRepairSnapshotPayload(
  snapshotKey: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged = { ...current, ...patch };
  if (!GUIDE_REPAIR_SNAPSHOT_KEYS.has(snapshotKey) || !Array.isArray(patch.repairReports)) return merged;

  const terminalById = new Map<string, unknown>();
  if (Array.isArray(current.repairReports)) {
    current.repairReports.forEach(report => {
      if (!isTerminalGuideRepairReport(report) || !report || typeof report !== "object") return;
      const id = (report as { id?: unknown }).id;
      if (typeof id === "string") terminalById.set(id, report);
    });
  }

  const incomingIds = new Set<string>();
  const repairReports = patch.repairReports.map(report => {
    if (!report || typeof report !== "object") return report;
    const id = (report as { id?: unknown }).id;
    if (typeof id !== "string") return report;
    incomingIds.add(id);
    const terminal = terminalById.get(id);
    return terminal && !isTerminalGuideRepairReport(report) ? terminal : report;
  });
  terminalById.forEach((report, id) => {
    if (!incomingIds.has(id)) repairReports.push(report);
  });
  merged.repairReports = repairReports;
  return merged;
}

export function reconcileFleetSnapshotFromMechanicState(
  fleet: Record<string, unknown>,
  mechanic: Record<string, unknown>,
): Record<string, unknown> {
  if (!Array.isArray(mechanic.repairs) || !Array.isArray(fleet.vehicleState && (fleet.vehicleState as Record<string, unknown>).vehicleGroups)) return fleet;
  const vehicleState = fleet.vehicleState as Record<string, unknown>;
  const groups = vehicleState.vehicleGroups as Array<Record<string, unknown>>;
  const latestByVehicle = new Map<number, Record<string, unknown>>();
  for (const raw of mechanic.repairs) {
    if (!raw || typeof raw !== "object") continue;
    const repair = raw as Record<string, unknown>;
    const number = Number(repair.vehicleNumber);
    const updatedAt = typeof repair.updatedAt === "string" ? Date.parse(repair.updatedAt) : Number.NaN;
    if (!Number.isInteger(number) || !Number.isFinite(updatedAt)) continue;
    const previous = latestByVehicle.get(number);
    if (!previous || updatedAt > Date.parse(String(previous.updatedAt))) latestByVehicle.set(number, repair);
  }
  if (!latestByVehicle.size) return fleet;
  const nextGroups = groups.map(group => {
    const numbers = Array.isArray(group.numbers) ? group.numbers.map(Number) : [];
    const target = numbers.filter(number => latestByVehicle.has(number));
    if (!target.length) return group;
    const unavailable = Array.isArray(group.unavailable) ? group.unavailable.map(Number).filter(number => !target.includes(number)) : [];
    const pickup = Array.isArray(group.pickup) ? group.pickup.map(Number).filter(number => !target.includes(number)) : [];
    const inUse = Array.isArray(group.inUse) ? group.inUse.map(Number).filter(number => !target.includes(number)) : [];
    for (const number of target) {
      const status = latestByVehicle.get(number)?.status;
      if (status === "กำลังซ่อม") unavailable.push(number);
      else if (status === "แจ้งรับรถ") pickup.push(number);
    }
    return { ...group, unavailable: Array.from(new Set(unavailable)).sort((a, b) => a - b), pickup: Array.from(new Set(pickup)).sort((a, b) => a - b), inUse: Array.from(new Set(inUse)).sort((a, b) => a - b) };
  });
  return { ...fleet, vehicleState: { ...vehicleState, vehicleGroups: nextGroups, updatedAt: Date.now() } };
}

/** Merge only the supplied fields so a session edit cannot erase centrally stored chat messages. */
export async function mergeAppOperationsSnapshot(snapshotKey: string, patchPayload: string): Promise<string> {
  const current = parseSnapshotRecord(await getAppOperationsSnapshot(snapshotKey));
  const patch = parseSnapshotRecord(patchPayload);
  const merged = JSON.stringify(mergeGuideRepairSnapshotPayload(snapshotKey, current, patch));
  await upsertAppOperationsSnapshot(snapshotKey, merged);
  if (snapshotKey === "atv-mechanic-state-v1" && Array.isArray(patch.repairs)) {
    const fleet = parseSnapshotRecord(await getAppOperationsSnapshot("atv-fleet-state-v1"));
    const reconciledFleet = reconcileFleetSnapshotFromMechanicState(fleet, JSON.parse(merged) as Record<string, unknown>);
    await upsertAppOperationsSnapshot("atv-fleet-state-v1", JSON.stringify(reconciledFleet));
  }
  return merged;
}

/** Append one validated JSON object to an array field in the central snapshot. */
export async function appendAppOperationsSnapshotItem(snapshotKey: string, field: string, itemPayload: string, maxItems = 200): Promise<string> {
  const current = parseSnapshotRecord(await getAppOperationsSnapshot(snapshotKey));
  let item: unknown;
  try {
    item = JSON.parse(itemPayload);
  } catch {
    throw new Error("Invalid snapshot item");
  }
  const existing = Array.isArray(current[field]) ? current[field] : [];
  const itemId = item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" ? (item as { id: string }).id : undefined;
  const withoutDuplicate = itemId ? existing.filter(value => !(value && typeof value === "object" && (value as { id?: unknown }).id === itemId)) : existing;
  const merged = JSON.stringify({ ...current, [field]: [...withoutDuplicate, item].slice(-maxItems) });
  await upsertAppOperationsSnapshot(snapshotKey, merged);
  return merged;
}

export async function listLiveMessages(channelType: "active" | "room", channelId: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appLiveMessages)
    .where(and(eq(appLiveMessages.channelType, channelType), eq(appLiveMessages.channelId, channelId)))
    .orderBy(desc(appLiveMessages.createdAt));
}

export async function appendLiveMessage(input: {
  channelType: "active" | "room";
  channelId: string;
  sessionId?: number;
  senderDirectoryUserId?: number;
  senderModule: "guide" | "mechanic" | "supervisor";
  senderName: string;
  body: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(appLiveMessages).values({
    channelType: input.channelType,
    channelId: input.channelId,
    sessionId: input.sessionId,
    senderDirectoryUserId: input.senderDirectoryUserId,
    senderModule: input.senderModule,
    senderName: input.senderName.trim(),
    body: input.body.trim(),
  });
  const id = Number(result[0].insertId);
  const rows = await db.select().from(appLiveMessages).where(eq(appLiveMessages.id, id)).limit(1);
  if (!rows[0]) throw new Error("Unable to save live message");
  return rows[0];
}

export async function appendOperationalHistory(input: {
  eventType: string;
  module: "guide" | "mechanic" | "supervisor" | "system";
  actorDirectoryUserId?: number;
  sessionId?: number;
  vehicleId?: number;
  payload: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(appOperationalHistory).values(input);
  const id = Number(result[0].insertId);
  const rows = await db.select().from(appOperationalHistory).where(eq(appOperationalHistory.id, id)).limit(1);
  if (!rows[0]) throw new Error("Unable to save operational history");
  return rows[0];
}

export async function listOperationalHistory(limit = 200) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(appOperationalHistory).orderBy(desc(appOperationalHistory.createdAt)).limit(limit);
}

export async function clearLiveMessages() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.delete(appLiveMessages);
  return Number(result[0].affectedRows ?? 0);
}
