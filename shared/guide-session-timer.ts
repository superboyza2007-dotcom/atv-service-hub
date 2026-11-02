import { isSessionExpiredAt, sessionDeadlineMs } from "./session-deadline";
import type { TimerExpiryBehavior } from "./supervisor-timer-settings";

type SnapshotRecord = Record<string, unknown>;

export type ReconciledGuideSessions = {
  payload: string;
  completedSessionIds: string[];
  releasedVehicleNumbers: number[];
};

export type GuideSessionTimerDefaults = {
  enabled?: boolean;
  expiryBehavior?: TimerExpiryBehavior;
};

function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseSnapshot(payload: string): { root?: SnapshotRecord; sessions?: unknown[] } {
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!isRecord(parsed) || !Array.isArray(parsed.sessions)) return {};
    return { root: parsed, sessions: parsed.sessions };
  } catch {
    return {};
  }
}

export function reconcileExpiredGuideSessions(
  payload: string,
  now = Date.now(),
  defaults: GuideSessionTimerDefaults = {},
): ReconciledGuideSessions {
  const parsed = parseSnapshot(payload);
  if (!parsed.root || !parsed.sessions) return { payload, completedSessionIds: [], releasedVehicleNumbers: [] };

  const completedSessionIds: string[] = [];
  const releasedVehicleNumbers = new Set<number>();
  const sessions = parsed.sessions.map(candidate => {
    if (!isRecord(candidate) || candidate.status !== "Active") return candidate;
    const timerEnabled = typeof candidate.timerEnabled === "boolean" ? candidate.timerEnabled : defaults.enabled ?? true;
    const expiryBehavior = candidate.expiryBehavior === "auto_complete" || candidate.expiryBehavior === "overtime"
      ? candidate.expiryBehavior
      : defaults.expiryBehavior ?? "overtime";
    if (!timerEnabled || expiryBehavior !== "auto_complete") return candidate;

    const startedAt = typeof candidate.startedAt === "string" || candidate.startedAt instanceof Date ? candidate.startedAt : undefined;
    const durationMinutes = typeof candidate.durationMinutes === "number" ? candidate.durationMinutes : Number.NaN;
    const scheduledEndAt = typeof candidate.scheduledEndAt === "string" || typeof candidate.scheduledEndAt === "number" || candidate.scheduledEndAt instanceof Date
      ? candidate.scheduledEndAt
      : undefined;
    if (!isSessionExpiredAt(startedAt, durationMinutes, now, scheduledEndAt) || typeof candidate.sessionId !== "string") return candidate;

    const deadline = sessionDeadlineMs(startedAt, durationMinutes, scheduledEndAt);
    if (deadline === undefined) return candidate;
    const completedAt = new Date(now).toISOString();
    const startedAtMs = startedAt instanceof Date ? startedAt.getTime() : Date.parse(startedAt ?? "");
    const plannedSeconds = Number.isFinite(startedAtMs)
      ? Math.max(0, Math.round((deadline - startedAtMs) / 1_000))
      : Math.max(0, Math.round(durationMinutes * 60));
    const actualSeconds = Number.isFinite(startedAtMs) ? Math.max(0, Math.floor((now - startedAtMs) / 1_000)) : plannedSeconds;
    const difference = actualSeconds - plannedSeconds;
    const activities = Array.isArray(candidate.activityLog) ? candidate.activityLog : [];
    const activityId = `auto-complete-${candidate.sessionId}`;
    const activityLog = activities.some(item => isRecord(item) && item.id === activityId) ? activities : [...activities, {
      id: activityId,
      actorId: "system",
      actorName: "ระบบ",
      action: "จบงานอัตโนมัติ → Completed",
      detail: `ครบเวลาโปรแกรม ${candidate.durationMinutes} นาที`,
      createdAt: completedAt,
    }];
    completedSessionIds.push(candidate.sessionId);
    if (Array.isArray(candidate.vehicleIds)) {
      for (const id of candidate.vehicleIds) {
        if (typeof id !== "string") continue;
        const number = Number(id.replace(/^m3-v/, ""));
        if (Number.isInteger(number) && number > 0) releasedVehicleNumbers.add(number);
      }
    }
    return {
      ...candidate,
      status: "Completed",
      completedAt,
      completedById: "system",
      completedByName: "ระบบ",
      overtimeAcknowledged: true,
      completionTiming: {
        plannedSeconds,
        actualSeconds,
        earlySeconds: Math.max(0, -difference),
        overtimeSeconds: Math.max(0, difference),
      },
      activityLog,
    };
  });

  return {
    payload: completedSessionIds.length ? JSON.stringify({ ...parsed.root, sessions }) : payload,
    completedSessionIds,
    releasedVehicleNumbers: Array.from(releasedVehicleNumbers),
  };
}

/** Apply a saved policy to running timed sessions, including older snapshots. */
export function applyExpiryBehaviorToActiveGuideSessions(payload: string, expiryBehavior: TimerExpiryBehavior) {
  const parsed = parseSnapshot(payload);
  if (!parsed.root || !parsed.sessions) return { payload, updatedSessionCount: 0 };
  let updatedSessionCount = 0;
  const sessions = parsed.sessions.map(candidate => {
    if (!isRecord(candidate) || candidate.status !== "Active" || candidate.timerEnabled === false || candidate.expiryBehavior === expiryBehavior) return candidate;
    updatedSessionCount += 1;
    return { ...candidate, timerEnabled: true, expiryBehavior };
  });
  return {
    payload: updatedSessionCount ? JSON.stringify({ ...parsed.root, sessions }) : payload,
    updatedSessionCount,
  };
}

export function releaseVehiclesFromFleetSnapshot(payload: string, vehicleNumbers: number[], now = Date.now()): string {
  if (!vehicleNumbers.length) return payload;
  let root: unknown;
  try {
    root = JSON.parse(payload);
  } catch {
    return payload;
  }
  if (!isRecord(root) || !isRecord(root.vehicleState) || !Array.isArray(root.vehicleState.vehicleGroups)) return payload;
  const released = new Set(vehicleNumbers);
  const vehicleState = root.vehicleState;
  const groups = vehicleState.vehicleGroups as unknown[];
  const vehicleGroups = groups.map((group: unknown) => {
    if (!isRecord(group) || !Array.isArray(group.inUse)) return group;
    return { ...group, inUse: group.inUse.filter(number => !released.has(Number(number))) };
  });
  return JSON.stringify({ ...root, vehicleState: { ...vehicleState, vehicleGroups, updatedAt: now } });
}
