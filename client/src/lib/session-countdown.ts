import { sessionDeadlineMs } from "@shared/session-deadline";

export function remainingSessionSeconds(startedAt: string | undefined, durationMinutes: number, now = Date.now(), scheduledEndAt?: string | number | Date) {
  const fallback = Math.max(0, durationMinutes * 60);
  const endAt = sessionDeadlineMs(startedAt, durationMinutes, scheduledEndAt);
  return endAt === undefined ? fallback : Math.max(0, Math.ceil((endAt - now) / 1000));
}

export function formatSessionCountdown(seconds: number) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function sessionTiming(startedAt: string | undefined, durationMinutes: number, now: number, scheduledEndAt?: string | number | Date) {
  const scheduledSeconds = Math.max(0, durationMinutes * 60);
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const endAt = sessionDeadlineMs(startedAt, durationMinutes, scheduledEndAt) ?? (Number.isFinite(startedAtMs) ? startedAtMs + scheduledSeconds * 1000 : undefined);
  if (!Number.isFinite(startedAtMs)) return {
    elapsedSeconds: 0,
    remainingSeconds: endAt === undefined ? scheduledSeconds : Math.max(0, Math.ceil((endAt - now) / 1000)),
    overtimeSeconds: endAt === undefined ? 0 : Math.max(0, Math.floor((now - endAt) / 1000)),
  };
  const safeEndAt = endAt ?? startedAtMs + scheduledSeconds * 1000;
  const elapsedSeconds = Math.max(0, Math.floor((now - startedAtMs) / 1000));
  return { elapsedSeconds, remainingSeconds: Math.max(0, Math.ceil((safeEndAt - now) / 1000)), overtimeSeconds: Math.max(0, Math.floor((now - safeEndAt) / 1000)) };
}
