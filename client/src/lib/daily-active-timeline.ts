export type StartedSession = {
  startedAt?: string;
};

export const DAILY_TIME_SLOTS = ["08:00", "10:00", "13:00", "15:00"] as const;
export type DailyTimeSlot = (typeof DAILY_TIME_SLOTS)[number];
const thaiHour = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hourCycle: "h23" });
const thaiDateTime = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });

/** The operational day changes at 07:00 Bangkok time, not at midnight. */
export function dailyOperationalDateKey(date: Date) {
  const parts = thaiDateTime.formatToParts(date);
  const value = (type: "year" | "month" | "day" | "hour") => Number(parts.find(part => part.type === type)?.value ?? "0");
  const year = value("year");
  const month = value("month");
  const day = value("day");
  if (value("hour") >= 7) return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return new Date(Date.UTC(year, month - 1, day) - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Returns only sessions started on the selected local day, in their real start order. */
export function buildDailyActiveTimeline<T extends StartedSession>(sessions: T[], day = new Date()) {
  const dayKey = dailyOperationalDateKey(day);
  return sessions
    .filter((session): session is T & { startedAt: string } => Boolean(session.startedAt))
    .filter(session => {
      const started = new Date(session.startedAt);
      return Number.isFinite(started.getTime()) && dailyOperationalDateKey(started) === dayKey;
    })
    .sort((left, right) => new Date(left.startedAt).getTime() - new Date(right.startedAt).getTime());
}

/** Keeps the original board headings while placing every Active session in its real start-time window. */
export function groupDailyActiveTimelineBySlot<T extends StartedSession>(sessions: T[], day = new Date()) {
  const groups = Object.fromEntries(DAILY_TIME_SLOTS.map(slot => [slot, [] as Array<T & { startedAt: string }>])) as Record<DailyTimeSlot, Array<T & { startedAt: string }>>;
  for (const session of buildDailyActiveTimeline(sessions, day)) {
    const hour = Number(thaiHour.format(new Date(session.startedAt)));
    const slot: DailyTimeSlot = hour < 10 ? "08:00" : hour < 13 ? "10:00" : hour < 15 ? "13:00" : "15:00";
    groups[slot].push(session);
  }
  return groups;
}
