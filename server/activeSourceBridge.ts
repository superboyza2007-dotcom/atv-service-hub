import { createHash } from "node:crypto";
import { getAppOperationsSnapshot } from "./db";

const GUIDE_SESSIONS_KEY = "atv-guide-sessions-v1";
const GUIDE_STATE_KEY = "atv-guide-state-v1";

type ActiveSourceSession = {
  sessionId: string;
  memberNames: string[];
  activeUserName?: string;
  startedAt?: string;
  durationMinutes?: number;
};

export type ActiveQueueBridgeSnapshot = {
  source: "guide-2.3-active";
  eventId: string;
  capturedAt: string;
  sessions: ActiveSourceSession[];
  completedSessionIds: string[];
};

const parseRecord = (payload: string | null | undefined): Record<string, unknown> => {
  if (!payload) return {};
  try {
    const parsed: unknown = JSON.parse(payload);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const stringValue = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : undefined;
const finitePositiveNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;

/**
 * Convert the Guide's persisted 2.3 source into the narrow, read-only contract
 * consumed by Team Board. This adapter does not dispatch, complete, or reorder
 * any queue run; the locked queue engine remains the only owner of those rules.
 */
export function buildActiveQueueBridgeSnapshot(
  guideSessionsPayload: string | null | undefined,
  guideStatePayload: string | null | undefined,
  capturedAt = new Date(),
): ActiveQueueBridgeSnapshot {
  const guideSessions = parseRecord(guideSessionsPayload);
  const guideState = parseRecord(guideStatePayload);
  const namesById = new Map<string, string>();
  const members = Array.isArray(guideState.members) ? guideState.members : [];

  for (const value of members) {
    if (!value || typeof value !== "object") continue;
    const member = value as { id?: unknown; name?: unknown };
    const id = stringValue(member.id);
    const name = stringValue(member.name);
    if (id && name) namesById.set(id, name);
  }

  const sessions: ActiveSourceSession[] = [];
  const completedSessionIds: string[] = [];
  const rawSessions = Array.isArray(guideSessions.sessions) ? guideSessions.sessions : [];
  for (const value of rawSessions) {
    if (!value || typeof value !== "object") continue;
    const session = value as {
      sessionId?: unknown;
      status?: unknown;
      memberIds?: unknown;
      activeUserName?: unknown;
      startedAt?: unknown;
      durationMinutes?: unknown;
    };
    const sessionId = stringValue(session.sessionId);
    if (!sessionId) continue;
    if (session.status === "Completed") {
      completedSessionIds.push(sessionId);
      continue;
    }
    if (session.status !== "Active") continue;

    const memberNames = Array.isArray(session.memberIds)
      ? Array.from(new Set(session.memberIds.map(id => namesById.get(String(id))).filter((name): name is string => Boolean(name))))
      : [];
    const startedAt = stringValue(session.startedAt);
    const activeUserName = stringValue(session.activeUserName);
    const durationMinutes = finitePositiveNumber(session.durationMinutes);
    sessions.push({
      sessionId,
      memberNames,
      ...(activeUserName ? { activeUserName } : {}),
      ...(startedAt ? { startedAt } : {}),
      ...(durationMinutes ? { durationMinutes } : {}),
    });
  }

  sessions.sort((left, right) => left.sessionId.localeCompare(right.sessionId));
  completedSessionIds.sort();
  const fingerprint = JSON.stringify({ sessions, completedSessionIds });
  const eventId = `2.3-active:${createHash("sha256").update(fingerprint).digest("hex").slice(0, 24)}`;
  return {
    source: "guide-2.3-active",
    eventId,
    capturedAt: capturedAt.toISOString(),
    sessions,
    completedSessionIds,
  };
}

export async function getActiveQueueBridgeSnapshot(now = new Date()): Promise<ActiveQueueBridgeSnapshot> {
  const [guideSessionsPayload, guideStatePayload] = await Promise.all([
    getAppOperationsSnapshot(GUIDE_SESSIONS_KEY),
    getAppOperationsSnapshot(GUIDE_STATE_KEY),
  ]);
  return buildActiveQueueBridgeSnapshot(guideSessionsPayload, guideStatePayload, now);
}
