export type SessionConflictRecord = {
  sessionId?: string;
  status?: string;
  memberIds?: unknown[];
  activeUserName?: string;
  vehicleIds?: unknown[];
};

export type SessionMemberRecord = {
  id?: unknown;
  name?: unknown;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

function normalizeMemberId(value: unknown): string {
  return normalizeText(value);
}

function normalizeVehicleId(value: unknown): string {
  const raw = normalizeText(value);
  const numberMatch = raw.match(/(?:m3[-_ ]?v|vehicle[-_ ]?)?(\d+)$/i);
  return numberMatch?.[1] ?? raw;
}

function splitNames(value: unknown): string[] {
  return String(value ?? "")
    .split(/[·,\/|]/)
    .map(normalizeText)
    .filter(name => name.length > 1);
}

export function sessionMemberKeys(session: SessionConflictRecord, members: SessionMemberRecord[] = []): Set<string> {
  const keys = new Set<string>();
  for (const memberId of session.memberIds ?? []) {
    const idKey = normalizeMemberId(memberId);
    if (idKey) keys.add(`id:${idKey}`);
    const member = members.find(item => normalizeMemberId(item.id) === idKey);
    const nameKey = normalizeText(member?.name);
    if (nameKey) keys.add(`name:${nameKey}`);
  }
  for (const name of splitNames(session.activeUserName)) keys.add(`name:${name}`);
  return keys;
}

export function sessionVehicleKeys(session: SessionConflictRecord): Set<string> {
  return new Set((session.vehicleIds ?? []).map(normalizeVehicleId).filter(Boolean).map(id => `vehicle:${id}`));
}

export function isOpenSession(session: SessionConflictRecord): boolean {
  return normalizeText(session.status) !== "completed";
}

export function findSessionConflict(
  sessions: SessionConflictRecord[],
  draft: SessionConflictRecord,
  members: SessionMemberRecord[] = [],
  ignoredSessionId?: string,
): { session: SessionConflictRecord; reason: "member" | "vehicle" } | undefined {
  const draftMemberKeys = sessionMemberKeys(draft, members);
  const draftVehicleKeys = sessionVehicleKeys(draft);
  for (const session of sessions) {
    if (!isOpenSession(session) || normalizeText(session.sessionId) === normalizeText(ignoredSessionId)) continue;
    const memberOverlap = Array.from(sessionMemberKeys(session, members)).some(key => draftMemberKeys.has(key));
    const vehicleOverlap = Array.from(sessionVehicleKeys(session)).some(key => draftVehicleKeys.has(key));
    if (memberOverlap || vehicleOverlap) return { session, reason: memberOverlap ? "member" : "vehicle" };
  }
  return undefined;
}

export function findSessionForMember(
  sessions: SessionConflictRecord[],
  memberId: unknown,
  memberName?: unknown,
  members: SessionMemberRecord[] = [],
): SessionConflictRecord | undefined {
  return findSessionConflict(sessions, { memberIds: [memberId], activeUserName: String(memberName ?? "") }, members)?.session;
}

export function occupiedMemberKeys(sessions: SessionConflictRecord[], members: SessionMemberRecord[] = []): Set<string> {
  const keys = new Set<string>();
  for (const session of sessions.filter(isOpenSession)) {
    for (const key of Array.from(sessionMemberKeys(session, members))) keys.add(key);
  }
  return keys;
}

export function occupiedVehicleKeys(sessions: SessionConflictRecord[]): Set<string> {
  const keys = new Set<string>();
  for (const session of sessions.filter(isOpenSession)) {
    for (const key of Array.from(sessionVehicleKeys(session))) keys.add(key);
  }
  return keys;
}
