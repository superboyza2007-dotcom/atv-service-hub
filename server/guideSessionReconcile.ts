import { reconcileExpiredGuideSessions, releaseVehiclesFromFleetSnapshot } from "../shared/guide-session-timer";
import { getAppOperationsSnapshot, upsertAppOperationsSnapshot } from "./db";
import { getSupervisorTimerSettings } from "./supervisorTimerSettings";

const GUIDE_SESSIONS_KEY = "atv-guide-sessions-v1";
const GUIDE_STATE_KEY = "atv-guide-state-v1";
const FLEET_KEY = "atv-fleet-state-v1";

export async function reconcileExpiredGuideSnapshotSessions(now = new Date()) {
  const [guideSessionsPayload, guideStatePayload, settings] = await Promise.all([
    getAppOperationsSnapshot(GUIDE_SESSIONS_KEY),
    getAppOperationsSnapshot(GUIDE_STATE_KEY),
    getSupervisorTimerSettings(),
  ]);
  const defaults = { enabled: settings.enabled, expiryBehavior: settings.expiryBehavior };
  if (!guideSessionsPayload && !guideStatePayload) return { expiredSessionCount: 0, returnedVehicleCount: 0 };

  const guideSessionsResult = guideSessionsPayload
    ? reconcileExpiredGuideSessions(guideSessionsPayload, now.getTime(), defaults)
    : { payload: guideSessionsPayload, completedSessionIds: [], releasedVehicleNumbers: [] };
  const guideStateResult = guideStatePayload
    ? reconcileExpiredGuideSessions(guideStatePayload, now.getTime(), defaults)
    : { payload: guideStatePayload, completedSessionIds: [], releasedVehicleNumbers: [] };
  const completedSessionIds = new Set([
    ...guideSessionsResult.completedSessionIds,
    ...guideStateResult.completedSessionIds,
  ]);
  const releasedVehicleNumbers = new Set([
    ...guideSessionsResult.releasedVehicleNumbers,
    ...guideStateResult.releasedVehicleNumbers,
  ]);
  if (!completedSessionIds.size) return { expiredSessionCount: 0, returnedVehicleCount: 0 };

  if (guideSessionsPayload && guideSessionsResult.completedSessionIds.length) {
    await upsertAppOperationsSnapshot(GUIDE_SESSIONS_KEY, guideSessionsResult.payload!);
  }
  if (guideStatePayload && guideStateResult.completedSessionIds.length) {
    await upsertAppOperationsSnapshot(GUIDE_STATE_KEY, guideStateResult.payload!);
  }
  const fleetPayload = await getAppOperationsSnapshot(FLEET_KEY);
  if (fleetPayload) {
    const nextFleet = releaseVehiclesFromFleetSnapshot(fleetPayload, Array.from(releasedVehicleNumbers), now.getTime());
    if (nextFleet !== fleetPayload) await upsertAppOperationsSnapshot(FLEET_KEY, nextFleet);
  }

  return {
    expiredSessionCount: completedSessionIds.size,
    returnedVehicleCount: releasedVehicleNumbers.size,
  };
}
