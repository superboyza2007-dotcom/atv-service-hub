import { completeVehicleSession, listActiveQueue, type VehicleActor } from "./vehicleFlowService";
import { createActiveQueueSnapshot, reconcileActiveSnapshot } from "./activeQueueAdapter";

/** Reads the authoritative Active list, preserving each Session as a complete run. */
export async function reconcileActiveQueue(previousEventId?: string) {
  const queue = await listActiveQueue();
  const snapshot = createActiveQueueSnapshot(queue);
  return { queue, ...reconcileActiveSnapshot(previousEventId, snapshot) };
}

/** Runs the first Active item to completion; authorization remains enforced by Vehicle Flow. */
export async function completeNextActiveQueue(actor: VehicleActor) {
  const queue = await listActiveQueue();
  const next = queue[0];
  if (!next) return { completed: false as const, reason: "ไม่มีรายการ Active ในคิว" };
  const result = await completeVehicleSession({ sessionId: next.sessionId, actor });
  return { completed: true as const, sessionId: next.sessionId, sessionCode: next.sessionCode, ...result };
}
