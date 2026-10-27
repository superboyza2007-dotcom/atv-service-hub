type SnapshotRecord = Record<string, unknown>;

export type ReconciledGuideSessions = {
  payload: string;
  completedSessionIds: string[];
  releasedVehicleNumbers: number[];
};

function isRecord(value: unknown): value is SnapshotRecord {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function deadlineFor(session: SnapshotRecord): number | undefined {
  if (typeof session.scheduledEndAt === "string") {
    const scheduled = Date.parse(session.scheduledEndAt);
    if (Number.isFinite(scheduled)) return scheduled;
  }
  if (typeof session.startedAt !== "string" || typeof session.durationMinutes !== "number") return undefined;
  const started = Date.parse(session.startedAt);
  if (!Number.isFinite(started) || session.durationMinutes <= 0) return undefined;
  return started + session.durationMinutes * 60_000;
}

export function reconcileExpiredGuideSessions(payload: string, now = Date.now()): ReconciledGuideSessions {
  let root: unknown;
  try {
    root = JSON.parse(payload);
  } catch {
    return { payload, completedSessionIds: [], releasedVehicleNumbers: [] };
  }
  if (!isRecord(root) || !Array.isArray(root.sessions)) return { payload, completedSessionIds: [], releasedVehicleNumbers: [] };

  const completedSessionIds: string[] = [];
  const releasedVehicleNumbers = new Set<number>();
  const sessions = root.sessions.map((candidate) => {
    if (!isRecord(candidate) || candidate.status !== "Active" || candidate.timerEnabled !== true || candidate.expiryBehavior !== "auto_complete") return candidate;
    const deadline = deadlineFor(candidate);
    if (deadline === undefined || deadline > now || typeof candidate.sessionId !== "string") return candidate;

    const completedAt = new Date(now).toISOString();
    const startedAt = typeof candidate.startedAt === "string" ? Date.parse(candidate.startedAt) : Number.NaN;
    const plannedSeconds = Math.max(0, Math.round(Number(candidate.durationMinutes) * 60));
    const actualSeconds = Number.isFinite(startedAt) ? Math.max(0, Math.floor((now - startedAt) / 1_000)) : plannedSeconds;
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
    payload: completedSessionIds.length ? JSON.stringify({ ...root, sessions }) : payload,
    completedSessionIds,
    releasedVehicleNumbers: Array.from(releasedVehicleNumbers),
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
