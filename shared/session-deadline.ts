export type SessionTimestamp = string | number | Date | null | undefined;

function timestampMs(value: SessionTimestamp): number | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : undefined;
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/** Resolve the absolute deadline, preferring a server-supplied scheduled end. */
export function sessionDeadlineMs(
  startedAt: SessionTimestamp,
  durationMinutes: number,
  scheduledEndAt?: SessionTimestamp,
): number | undefined {
  const scheduled = timestampMs(scheduledEndAt);
  if (scheduled !== undefined) return scheduled;

  const started = timestampMs(startedAt);
  if (started === undefined || !Number.isFinite(durationMinutes) || durationMinutes < 0) return undefined;
  return started + durationMinutes * 60_000;
}

export function isSessionExpiredAt(
  startedAt: SessionTimestamp,
  durationMinutes: number,
  now = Date.now(),
  scheduledEndAt?: SessionTimestamp,
): boolean {
  const deadline = sessionDeadlineMs(startedAt, durationMinutes, scheduledEndAt);
  return deadline !== undefined && deadline <= now;
}
