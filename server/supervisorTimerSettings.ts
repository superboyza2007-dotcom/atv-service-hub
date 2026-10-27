import { getAppOperationsSnapshot } from "./db";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS, normalizeSupervisorTimerSettings, SUPERVISOR_TIMER_SETTINGS_SNAPSHOT_KEY, type SupervisorTimerSettings } from "../shared/supervisor-timer-settings";

export async function getSupervisorTimerSettings(): Promise<SupervisorTimerSettings> {
  const payload = await getAppOperationsSnapshot(SUPERVISOR_TIMER_SETTINGS_SNAPSHOT_KEY);
  if (!payload) return { ...DEFAULT_SUPERVISOR_TIMER_SETTINGS };
  try {
    return normalizeSupervisorTimerSettings(JSON.parse(payload));
  } catch {
    return { ...DEFAULT_SUPERVISOR_TIMER_SETTINGS };
  }
}
