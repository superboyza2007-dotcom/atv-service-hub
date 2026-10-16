import { vehicleHistoryOrFallback, type SessionVehicleHistory } from "@/lib/session-vehicle-history";

export type UsageVehicleLike = { id: string; number: string; cc: "200" | "250" };

export type UsageSessionLike = {
  sessionId?: string;
  status?: string;
  durationMinutes?: number;
  vehicleIds?: string[];
  vehicleHistory?: SessionVehicleHistory[];
  activityLog?: Array<{ action: string; detail?: string; createdAt: string }>;
  createdAt?: string;
  completedAt?: string;
};

export type VehicleUsageHours = {
  number: string;
  cc: "200" | "250";
  round30: number;
  round60: number;
  totalRounds: number;
  accumulatedHours: number;
  lastUsedAt?: string;
};

function isCompletedSession(session: UsageSessionLike) {
  return session.status === "Completed" && (session.durationMinutes === 30 || session.durationMinutes === 60);
}

function sessionVehicles(session: UsageSessionLike, vehicles: UsageVehicleLike[]) {
  return vehicleHistoryOrFallback(
    {
      vehicleIds: session.vehicleIds ?? [],
      vehicleHistory: session.vehicleHistory,
      activityLog: session.activityLog,
    },
    vehicles,
    session.createdAt ?? session.completedAt ?? "",
  );
}

export function summarizeVehicleUsageHours(sessions: UsageSessionLike[], vehicles: UsageVehicleLike[]): VehicleUsageHours[] {
  const summary = new Map<string, VehicleUsageHours>();
  vehicles.forEach(vehicle => {
    const number = String(vehicle.number);
    summary.set(number, {
      number,
      cc: vehicle.cc,
      round30: 0,
      round60: 0,
      totalRounds: 0,
      accumulatedHours: 0,
    });
  });

  const seenSessions = new Set<string>();
  sessions.filter(isCompletedSession).forEach((session, index) => {
    const identity = session.sessionId || `${session.createdAt ?? "unknown"}-${index}`;
    if (seenSessions.has(identity)) return;
    seenSessions.add(identity);
    const usedAt = session.completedAt ?? session.createdAt;
    const durationMinutes = session.durationMinutes as 30 | 60;
    const history = sessionVehicles(session, vehicles);
    const uniqueNumbers = new Set(history.map(vehicle => String(vehicle.number)));
    uniqueNumbers.forEach(number => {
      const vehicle = summary.get(number);
      if (!vehicle) return;
      if (durationMinutes === 30) vehicle.round30 += 1;
      else vehicle.round60 += 1;
      vehicle.totalRounds += 1;
      vehicle.accumulatedHours += durationMinutes / 60;
      if (usedAt && (!vehicle.lastUsedAt || new Date(usedAt).getTime() > new Date(vehicle.lastUsedAt).getTime())) vehicle.lastUsedAt = usedAt;
    });
  });

  return Array.from(summary.values()).sort((a, b) => a.cc.localeCompare(b.cc) || Number(a.number) - Number(b.number));
}

export function accumulatedHoursForVehicle(rows: VehicleUsageHours[], vehicleNumber: number | string): number | undefined {
  const normalizedNumber = String(vehicleNumber).trim();
  const row = rows.find(item => String(item.number).trim() === normalizedNumber);
  return row && Number.isFinite(row.accumulatedHours) ? row.accumulatedHours : undefined;
}
