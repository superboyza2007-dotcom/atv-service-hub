export const OPERATIONS_SNAPSHOT_KEYS = {
  fleet: "atv-fleet-state-v1",
  guideSessions: "atv-guide-sessions-v1",
  communicationRoom: "atv-communication-room-v1",
  vehicleFlow: "atv-vehicle-flow-v1",
  runQueue: "atv-run-queue-v1",
  mechanicState: "atv-mechanic-state-v1",
  guideState: "atv-guide-state-v1",
} as const;

export const SHARED_RUN_QUEUE_SNAPSHOT_KEY = OPERATIONS_SNAPSHOT_KEYS.runQueue;

export function parseOperationsSnapshot<T>(payload: string | null | undefined): T | undefined {
  if (!payload) return undefined;
  try {
    return JSON.parse(payload) as T;
  } catch {
    return undefined;
  }
}

export function serializeOperationsSnapshot(value: unknown): string {
  return JSON.stringify(value);
}
