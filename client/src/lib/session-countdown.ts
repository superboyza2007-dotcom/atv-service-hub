function resolveScheduledEnd(startedAt: string | undefined, durationMinutes: number, scheduledEndAt?: string | number) {
  if (typeof scheduledEndAt === "number" && Number.isFinite(scheduledEndAt)) return scheduledEndAt;
  if (typeof scheduledEndAt === "string") {
    const parsed = Date.parse(scheduledEndAt);
    if (Number.isFinite(parsed)) return parsed;
  }
  if (!startedAt) return undefined;
  const startedAtMs = Date.parse(startedAt);
  return Number.isFinite(startedAtMs) ? startedAtMs + Math.max(0, durationMinutes * 60) * 1000 : undefined;
}

export function remainingSessionSeconds(startedAt: string | undefined, durationMinutes: number, now = Date.now(), scheduledEndAt?: string | number) {
  const fallback = Math.max(0, durationMinutes * 60);
  const endAt = resolveScheduledEnd(startedAt, durationMinutes, scheduledEndAt);
  return endAt === undefined ? fallback : Math.max(0, Math.ceil((endAt - now) / 1000));
}

export function formatSessionCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function sessionTiming(startedAt: string | undefined, durationMinutes: number, now: number, scheduledEndAt?: string | number) {
  const scheduledSeconds = Math.max(0, durationMinutes * 60);
  if (!startedAt) return { elapsedSeconds: 0, remainingSeconds: scheduledSeconds, overtimeSeconds: 0 };
  const startedAtMs = Date.parse(startedAt);
  if (!Number.isFinite(startedAtMs)) return { elapsedSeconds: 0, remainingSeconds: scheduledSeconds, overtimeSeconds: 0 };
  const endAt = resolveScheduledEnd(startedAt, durationMinutes, scheduledEndAt) ?? startedAtMs + scheduledSeconds * 1000;
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  return { elapsedSeconds, remainingSeconds: Math.max(0, Math.ceil((endAt - now) / 1000)), overtimeSeconds: Math.max(0, Math.floor((now - endAt) / 1000)) };
}
