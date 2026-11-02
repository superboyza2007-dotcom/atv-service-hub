import { and, eq } from "drizzle-orm";
import { vehicleSessions } from "../drizzle/schema";
import { applyExpiryBehaviorToActiveGuideSessions } from "../shared/guide-session-timer";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS, normalizeSupervisorTimerSettings, SUPERVISOR_TIMER_SETTINGS_SNAPSHOT_KEY, type SupervisorTimerSettings, type TimerExpiryBehavior } from "../shared/supervisor-timer-settings";
import { getAppOperationsSnapshot, getDb, upsertAppOperationsSnapshot } from "./db";

const GUIDE_SESSION_SNAPSHOT_KEYS = ["atv-guide-sessions-v1", "atv-guide-state-v1"];

export async function getSupervisorTimerSettings(): Promise<SupervisorTimerSettings> {
  const payload = await getAppOperationsSnapshot(SUPERVISOR_TIMER_SETTINGS_SNAPSHOT_KEY);
  if (!payload) return { ...DEFAULT_SUPERVISOR_TIMER_SETTINGS };
  try {
    return normalizeSupervisorTimerSettings(JSON.parse(payload));
  } catch {
    return { ...DEFAULT_SUPERVISOR_TIMER_SETTINGS };
  }
}

/** A saved expiry policy also applies to sessions already running their timer. */
export async function applyExpiryBehaviorToActiveSessions(expiryBehavior: TimerExpiryBehavior) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available while updating active session timer policy");
  const result = await db.update(vehicleSessions)
    .set({ expiryBehavior })
    .where(and(eq(vehicleSessions.status, "active"), eq(vehicleSessions.timerEnabled, true)));
  let guideSessionCount = 0;
  for (const key of GUIDE_SESSION_SNAPSHOT_KEYS) {
    const payload = await getAppOperationsSnapshot(key);
    if (!payload) continue;
    const updated = applyExpiryBehaviorToActiveGuideSessions(payload, expiryBehavior);
    if (!updated.updatedSessionCount) continue;
    await upsertAppOperationsSnapshot(key, updated.payload);
    guideSessionCount += updated.updatedSessionCount;
  }
  return {
    vehicleSessionCount: Number(result[0].affectedRows ?? 0),
    guideSessionCount,
  };
}
