import { formatSessionCountdown, sessionTiming } from "./session-countdown";
import type { TimerExpiryBehavior } from "@shared/supervisor-timer-settings";

export function supervisorActiveTimeLabel(startedAt: string | undefined, durationMinutes: number, now: number, scheduledEndAt?: string, timerEnabled = true, expiryBehavior?: TimerExpiryBehavior) {
  const timing = sessionTiming(startedAt, durationMinutes, now, scheduledEndAt);
  return {
    ...timing,
    label: !timerEnabled
      ? "ปิดตัวจับเวลา"
      : timing.overtimeSeconds > 0
        ? expiryBehavior === "auto_complete" ? "ครบเวลา · ระบบกำลังจบรายการ" : `เวลาบวก +${formatSessionCountdown(timing.overtimeSeconds)}`
        : `เหลือเวลา ${formatSessionCountdown(timing.remainingSeconds)}`,
  };
}
