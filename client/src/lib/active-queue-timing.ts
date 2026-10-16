export type ActiveMemberSnapshot = {
  sessionId?: string;
  memberId?: string;
  name: string;
  startedAt: string;
  durationMinutes: number;
};

export function normalizeActiveMemberName(name: string) {
  return name.trim().replace(/\s+/g, " ").toLocaleLowerCase("th-TH");
}

export function earliestActiveTimingForNames(names: string[], snapshots: ActiveMemberSnapshot[]) {
  const requested = new Set(names.map(normalizeActiveMemberName));
  return snapshots
    .filter((snapshot) => requested.has(normalizeActiveMemberName(snapshot.name)))
    .filter((snapshot) => Number.isFinite(Date.parse(snapshot.startedAt)) && snapshot.durationMinutes > 0)
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))[0];
}
