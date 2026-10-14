export type SharedSessionStatus = "Standby" | "Active" | "Completed";

export type SharedSessionRecord = {
  sessionId: string;
  status: SharedSessionStatus;
  completedAt?: string;
  completedById?: string;
  completedByName?: string;
  activityLog?: Array<{ id: string; actorId?: string; actorName: string; action: string; detail?: string; createdAt: string }>;
};

const statusPriority: Record<SharedSessionStatus, number> = {
  Standby: 1,
  Active: 2,
  Completed: 3,
};

function latestTimestamp(...values: Array<string | undefined>) {
  return values
    .map(value => value ? Date.parse(value) : Number.NaN)
    .filter(Number.isFinite)
    .reduce((latest, value) => Math.max(latest, value), Number.NEGATIVE_INFINITY);
}

function mergeOneSession<T extends SharedSessionRecord>(local: T | undefined, remote: T): T {
  if (!local) return remote;
  const localPriority = statusPriority[local.status];
  const remotePriority = statusPriority[remote.status];
  if (remotePriority > localPriority) return { ...local, ...remote };
  if (localPriority > remotePriority) return { ...remote, ...local };

  // A completed record is terminal. If both sides are completed, prefer the
  // record with the newest completion timestamp and retain any richer log.
  if (remote.status === "Completed") {
    const remoteCompletedAt = latestTimestamp(remote.completedAt);
    const localCompletedAt = latestTimestamp(local.completedAt);
    const winner = remoteCompletedAt >= localCompletedAt ? remote : local;
    const loser = winner === remote ? local : remote;
    return {
      ...loser,
      ...winner,
      activityLog: winner.activityLog?.length ? winner.activityLog : loser.activityLog,
    };
  }

  // For non-terminal states the remote snapshot is authoritative for fields
  // it knows, while keeping local-only fields during first-device creation.
  return { ...local, ...remote };
}

export function mergeSharedSessions<T extends SharedSessionRecord>(local: T[], remote: T[]): T[] {
  const remoteById = new Map(remote.map(session => [session.sessionId, session]));
  const merged = local.map(session => {
    const remoteSession = remoteById.get(session.sessionId);
    return remoteSession ? mergeOneSession(session, remoteSession) : session;
  });
  const localIds = new Set(local.map(session => session.sessionId));
  return [...merged, ...remote.filter(session => !localIds.has(session.sessionId))];
}

export function patchSharedSession<T extends SharedSessionRecord>(sessions: T[], sessionId: string, patch: Partial<T>): T[] {
  return sessions.map(session => session.sessionId === sessionId ? { ...session, ...patch } : session);
}

export function completedSessionFromRecord<T extends SharedSessionRecord>(sessions: T[], sessionId: string) {
  return sessions.find(session => session.sessionId === sessionId && session.status === "Completed");
}
