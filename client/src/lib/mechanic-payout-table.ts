export const PAYOUT_ROUND_COLUMNS = [30, 60] as const;
export type PayoutRoundMinutes = (typeof PAYOUT_ROUND_COLUMNS)[number];
export type PayoutRoundCell = Record<PayoutRoundMinutes, number>;
export type PersonalPayoutValues = Record<string, Record<string, PayoutRoundCell>>;
export type PayoutSessionLike = {
  status?: string;
  durationMinutes?: number;
  memberIds?: string[];
  activeUserId?: string;
  completedAt?: string;
  createdAt: string;
};
export type PersonalPayoutRow = {
  date: Date;
  key: string;
  rounds: [number, number];
  driveHours: number;
  totalRounds: number;
  payout: number;
  sessions: PayoutSessionLike[];
};

const PAYOUT_TIME_ZONE = "Asia/Bangkok";

export function payoutDateKeyFromParts(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function payoutPageOffsetForDate(date: Date) {
  return date.getDate() >= 16 ? 1 : 0;
}

export function payoutDateKey(date: Date) {
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: PAYOUT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const values = Object.fromEntries(parts.filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizePayoutValue(value: string | number) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function completedSessionsForDay(sessions: PayoutSessionLike[], key: string, userId: string) {
  return sessions.filter(session => session.status === "Completed" && payoutDateKey(new Date(session.completedAt ?? session.createdAt)) === key && (session.activeUserId && String(session.activeUserId) === String(userId) || (session.memberIds ?? []).map(String).includes(String(userId))));
}

export function buildPersonalPayoutRows(options: {
  year: number;
  month: number;
  half: 1 | 2;
  userId: string;
  sessions: PayoutSessionLike[];
  values?: PersonalPayoutValues;
}): PersonalPayoutRow[] {
  const { year, month, half, userId, sessions, values = {} } = options;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const start = half === 1 ? 1 : 16;
  const end = half === 1 ? 15 : daysInMonth;
  return Array.from({ length: end - start + 1 }, (_, index) => {
    const day = start + index;
    const date = new Date(year, month, day, 12, 0, 0);
    const key = payoutDateKeyFromParts(year, month, day);
    const sessionsForDay = completedSessionsForDay(sessions, key, userId);
    const stored = values[userId]?.[key];
    const rounds: [number, number] = [
      stored?.[30] ?? sessionsForDay.filter(session => session.durationMinutes === 30).length,
      stored?.[60] ?? sessionsForDay.filter(session => session.durationMinutes === 60).length,
    ];
    const totalRounds = rounds[0] + rounds[1];
    const driveHours = rounds[0] * 0.5 + rounds[1];
    return { date, key, rounds, driveHours, totalRounds, payout: rounds[0] * 50 + rounds[1] * 100, sessions: sessionsForDay };
  });
}

export function updatePersonalPayoutValue(values: PersonalPayoutValues, userId: string, key: string, minutes: PayoutRoundMinutes, value: string | number, sessions: PayoutSessionLike[] = []) {
  const sessionsForDay = completedSessionsForDay(sessions, key, userId);
  const previous = values[userId]?.[key];
  const nextCell: PayoutRoundCell = {
    30: previous?.[30] ?? sessionsForDay.filter(session => session.durationMinutes === 30).length,
    60: previous?.[60] ?? sessionsForDay.filter(session => session.durationMinutes === 60).length,
    [minutes]: normalizePayoutValue(value),
  };
  return { ...values, [userId]: { ...values[userId], [key]: nextCell } };
}
