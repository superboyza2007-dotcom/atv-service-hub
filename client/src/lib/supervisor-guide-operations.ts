import { normalizeSessionExpiryBehavior, type TimerExpiryBehavior } from "@shared/supervisor-timer-settings";

export type SupervisorGuideStatus = "Standby" | "Active" | "TIME_EXPIRED" | "Completed";
export type SupervisorGuideSession = {
  sessionId: string;
  status: SupervisorGuideStatus;
  durationMinutes: 30 | 60;
  vehicleIds: string[];
  memberIds: string[];
  activeUserName?: string;
  riderCount: number;
  passengerCount: number;
  createdAt: string;
  startedAt?: string;
  scheduledEndAt?: string;
  completedAt?: string;
  completedById?: string;
  completedByName?: string;
  overtimeAcknowledged?: boolean;
  timerEnabled?: boolean;
  expiryBehavior?: TimerExpiryBehavior;
};

export type SupervisorGuideMember = { id: string; name: string };
export type SupervisorGuideVehicle = { number: string; cc: "200" | "250"; status: "ready" | "repair" | "inspection" | "pickup" | "active" };
export type SupervisorGuideSafetyNotice = { vehicleNumber: number };
export type SupervisorGuideStatusSummary = {
  ready: number;
  repair: number;
  alert: number;
  pickup: number;
  active: number;
  total: number;
};

const sessionStatuses = new Set<SupervisorGuideStatus>(["Standby", "Active", "TIME_EXPIRED", "Completed"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function findSupervisorGuideSession(sessions: SupervisorGuideSession[], sessionId?: string) {
  return sessionId ? sessions.find(session => session.sessionId === sessionId) : undefined;
}

export function normalizeSupervisorGuideSessions(value: unknown): SupervisorGuideSession[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.sessionId !== "string" || !sessionStatuses.has(item.status as SupervisorGuideStatus)) return [];
    const durationMinutes = item.durationMinutes === 60 ? 60 : item.durationMinutes === 30 ? 30 : null;
    if (!durationMinutes) return [];
    return [{
      sessionId: item.sessionId,
      status: item.status as SupervisorGuideStatus,
      durationMinutes,
      vehicleIds: asStringArray(item.vehicleIds),
      memberIds: asStringArray(item.memberIds),
      activeUserName: typeof item.activeUserName === "string" ? item.activeUserName : undefined,
      riderCount: Number.isFinite(item.riderCount) ? Number(item.riderCount) : 0,
      passengerCount: Number.isFinite(item.passengerCount) ? Number(item.passengerCount) : 0,
      createdAt: typeof item.createdAt === "string" ? item.createdAt : "",
      startedAt: typeof item.startedAt === "string" ? item.startedAt : undefined,
      scheduledEndAt: typeof item.scheduledEndAt === "string" ? item.scheduledEndAt : undefined,
      completedAt: typeof item.completedAt === "string" ? item.completedAt : undefined,
      completedById: typeof item.completedById === "string" ? item.completedById : undefined,
      completedByName: typeof item.completedByName === "string" ? item.completedByName : undefined,
      overtimeAcknowledged: item.overtimeAcknowledged === true,
      timerEnabled: typeof item.timerEnabled === "boolean" ? item.timerEnabled : undefined,
      expiryBehavior: normalizeSessionExpiryBehavior(item.expiryBehavior),
    }];
  });
}

export function normalizeSupervisorGuideMembers(value: unknown): SupervisorGuideMember[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!isRecord(item) || typeof item.id !== "string" || typeof item.name !== "string" || !item.name.trim()) return [];
    return [{ id: item.id, name: item.name.trim() }];
  });
}

export function summarizeSupervisorGuideStatus(vehicles: SupervisorGuideVehicle[], notices: SupervisorGuideSafetyNotice[] = []): SupervisorGuideStatusSummary {
  const summary = { ready: 0, repair: 0, alert: 0, pickup: 0, active: 0, total: vehicles.length };
  const numbersByCc = new Map<"200" | "250", Set<number>>([
    ["200", new Set(vehicles.filter(vehicle => vehicle.cc === "200").map(vehicle => Number(vehicle.number)))],
    ["250", new Set(vehicles.filter(vehicle => vehicle.cc === "250").map(vehicle => Number(vehicle.number)))],
  ]);
  vehicles.forEach(vehicle => {
    if (vehicle.status === "ready") summary.ready += 1;
    if (vehicle.status === "repair") summary.repair += 1;
    if (vehicle.status === "active") summary.active += 1;
    if (vehicle.status === "pickup") summary.pickup += 1;
  });
  summary.alert = notices.filter(notice => numbersByCc.get("200")?.has(notice.vehicleNumber) || numbersByCc.get("250")?.has(notice.vehicleNumber)).length;
  return summary;
}

export function buildSupervisorActiveMemberSnapshots(sessions: SupervisorGuideSession[], members: SupervisorGuideMember[]) {
  const memberNames = new Map(members.map(member => [member.id, member.name]));
  return sessions
    .filter(session => session.status === "Active" || session.status === "TIME_EXPIRED")
    .flatMap(session => session.memberIds.map(memberId => {
      const name = memberNames.get(memberId);
      return name && session.startedAt ? { sessionId: session.sessionId, memberId, name, startedAt: session.startedAt, durationMinutes: session.durationMinutes } : null;
    }).filter((snapshot): snapshot is { sessionId: string; memberId: string; name: string; startedAt: string; durationMinutes: 30 | 60 } => Boolean(snapshot)));
}
