import type { ActiveQueueItem } from "./vehicleFlowService";

export type ActiveQueueSnapshot = {
  source: "vehicle-flow";
  eventId: string;
  capturedAt: number;
  activeRuns: Array<{
    id: string;
    memberIds: string[];
    startedAt: number | null;
    durationSeconds: number;
    vehicleIds: number[];
  }>;
};

/** Creates a complete, stable Active snapshot; every session remains one run. */
export function createActiveQueueSnapshot(items: ActiveQueueItem[], capturedAt = Date.now()): ActiveQueueSnapshot {
  const activeRuns = items.map(item => ({
    id: String(item.sessionId),
    memberIds: [],
    startedAt: item.startedAt?.getTime() ?? null,
    durationSeconds: item.durationMinutes * 60,
    vehicleIds: item.vehicles.map(vehicle => vehicle.id),
  }));
  const fingerprint = activeRuns.map(run => `${run.id}:${run.startedAt ?? "pending"}:${run.vehicleIds.join(",")}`).join("|");
  return {
    source: "vehicle-flow",
    eventId: `active-${capturedAt}-${fingerprint || "empty"}`,
    capturedAt,
    activeRuns,
  };
}

/** Makes reconciliation idempotent when the same active snapshot is replayed. */
export function reconcileActiveSnapshot(previousEventId: string | undefined, snapshot: ActiveQueueSnapshot) {
  if (previousEventId === snapshot.eventId) return { ignored: true as const, snapshot };
  return { ignored: false as const, snapshot };
}
