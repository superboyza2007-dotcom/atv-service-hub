import { getAppOperationsSnapshot, upsertAppOperationsSnapshot } from "./db";
import { reconcileExpiredGuideSessions, releaseVehiclesFromFleetSnapshot } from "../shared/guide-session-timer";

const GUIDE_SESSIONS_KEY = "atv-guide-sessions-v1";
const FLEET_KEY = "atv-fleet-state-v1";

export async function reconcileExpiredGuideSnapshotSessions(now = new Date()) {
  const payload = await getAppOperationsSnapshot(GUIDE_SESSIONS_KEY);
  if (!payload) return { expiredSessionCount: 0, returnedVehicleCount: 0 };

  const result = reconcileExpiredGuideSessions(payload, now.getTime());
  if (!result.completedSessionIds.length) return { expiredSessionCount: 0, returnedVehicleCount: 0 };

  await upsertAppOperationsSnapshot(GUIDE_SESSIONS_KEY, result.payload);
  const fleetPayload = await getAppOperationsSnapshot(FLEET_KEY);
  if (fleetPayload) {
    const nextFleet = releaseVehiclesFromFleetSnapshot(fleetPayload, result.releasedVehicleNumbers, now.getTime());
    if (nextFleet !== fleetPayload) await upsertAppOperationsSnapshot(FLEET_KEY, nextFleet);
  }

  return {
    expiredSessionCount: result.completedSessionIds.length,
    returnedVehicleCount: result.releasedVehicleNumbers.length,
  };
}
