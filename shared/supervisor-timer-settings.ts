export type TimerExpiryBehavior = "auto_complete" | "overtime";

export type SupervisorTimerSettings = {
  enabled: boolean;
  defaultDurationMinutes: 30 | 60;
  expiryBehavior: TimerExpiryBehavior;
};

export const SUPERVISOR_TIMER_SETTINGS_SNAPSHOT_KEY = "atv-supervisor-timer-settings-v1";

export const DEFAULT_SUPERVISOR_TIMER_SETTINGS: SupervisorTimerSettings = {
  enabled: true,
  defaultDurationMinutes: 30,
  expiryBehavior: "overtime",
};

export function normalizeSupervisorTimerSettings(value: unknown): SupervisorTimerSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_SUPERVISOR_TIMER_SETTINGS };
  const record = value as Record<string, unknown>;
  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : DEFAULT_SUPERVISOR_TIMER_SETTINGS.enabled,
    defaultDurationMinutes: record.defaultDurationMinutes === 60 ? 60 : record.defaultDurationMinutes === 30 ? 30 : DEFAULT_SUPERVISOR_TIMER_SETTINGS.defaultDurationMinutes,
    expiryBehavior: record.expiryBehavior === "auto_complete" || record.expiryBehavior === "overtime" ? record.expiryBehavior : DEFAULT_SUPERVISOR_TIMER_SETTINGS.expiryBehavior,
  };
}

export function normalizeSessionTimerEnabled(value: unknown): boolean {
  return typeof value === "boolean" ? value : true;
}

export function normalizeSessionExpiryBehavior(value: unknown): TimerExpiryBehavior | undefined {
  return value === "auto_complete" || value === "overtime" ? value : undefined;
}
