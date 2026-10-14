import { formatSessionCountdown, sessionTiming } from "./session-countdown";

export function supervisorActiveTimeLabel(startedAt: string | undefined, durationMinutes: number, now: number) {
  const timing = sessionTiming(startedAt, durationMinutes, now);
  return {
    ...timing,
    label: timing.overtimeSeconds > 0
      ? `เวลาบวก +${formatSessionCountdown(timing.overtimeSeconds)}`
      : `เหลือเวลา ${formatSessionCountdown(timing.remainingSeconds)}`,
  };
}
