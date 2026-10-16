export type SessionCompletionTiming = {
  plannedSeconds: number;
  actualSeconds: number;
  earlySeconds: number;
  overtimeSeconds: number;
};

export function sessionCompletionTiming(startedAt: string | undefined, completedAt: string, durationMinutes: number): SessionCompletionTiming {
  const plannedSeconds = Math.max(0, Math.round(durationMinutes * 60));
  const startedMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const completedMs = Date.parse(completedAt);
  const actualSeconds = Number.isFinite(startedMs) && Number.isFinite(completedMs)
    ? Math.max(0, Math.floor((completedMs - startedMs) / 1000))
    : plannedSeconds;
  const difference = actualSeconds - plannedSeconds;
  return {
    plannedSeconds,
    actualSeconds,
    earlySeconds: Math.max(0, -difference),
    overtimeSeconds: Math.max(0, difference),
  };
}

export function formatCompletionDifference(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  if (minutes && remainder) return `${minutes} นาที ${remainder} วินาที`;
  if (minutes) return `${minutes} นาที`;
  return `${remainder} วินาที`;
}

export function completionTimingDetail(timing: SessionCompletionTiming) {
  if (timing.earlySeconds > 0) return `จบก่อนโปรแกรม ${formatCompletionDifference(timing.earlySeconds)}`;
  if (timing.overtimeSeconds > 0) return `เกินโปรแกรม ${formatCompletionDifference(timing.overtimeSeconds)}`;
  return "จบตรงตามเวลาโปรแกรม";
}
