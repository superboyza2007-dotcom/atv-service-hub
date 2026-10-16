import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  repairJobs,
  vehicleGroupMembers,
  vehicleGroups,
  vehicleNotifications,
  vehicleSessionVehicles,
  vehicleSessions,
  vehicleStatusHistory,
  vehicles,
  type VehicleFlowEvent,
  type VehicleStatus,
} from "../drizzle/schema";
import { getDb } from "./db";
import {
  assertVehicleTransition,
  type AppRole,
  type FleetMembershipRole,
  VehicleFlowRuleError,
} from "./vehicleFlowRules";

export type VehicleActor = { id: number; role: AppRole };

const requireDatabase = async () => {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  return db;
};

async function getVehicleContext(vehicleId: number) {
  const db = await requireDatabase();
  const rows = await db
    .select({
      id: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      engineCc: vehicles.engineCc,
      status: vehicles.status,
      groupId: vehicles.groupId,
      groupCode: vehicleGroups.code,
      groupName: vehicleGroups.name,
    })
    .from(vehicles)
    .innerJoin(vehicleGroups, eq(vehicles.groupId, vehicleGroups.id))
    .where(eq(vehicles.id, vehicleId))
    .limit(1);
  const vehicle = rows[0];
  if (!vehicle) throw new Error("ไม่พบรถที่เลือก");
  return { db, vehicle };
}

async function getVehicleIdByNumber(vehicleNumber: number) {
  const db = await requireDatabase();
  const rows = await db.select({ id: vehicles.id }).from(vehicles).where(eq(vehicles.vehicleNumber, vehicleNumber)).limit(1);
  const vehicle = rows[0];
  if (!vehicle) throw new VehicleFlowRuleError("ไม่พบรถที่เลือกในฐานข้อมูลกลาง");
  return vehicle.id;
}

async function getMembershipRole(userId: number, groupId: number): Promise<FleetMembershipRole> {
  const db = await requireDatabase();
  const rows = await db
    .select({ memberRole: vehicleGroupMembers.memberRole })
    .from(vehicleGroupMembers)
    .where(and(eq(vehicleGroupMembers.userId, userId), eq(vehicleGroupMembers.groupId, groupId)))
    .limit(1);
  return rows[0]?.memberRole ?? null;
}

async function appendStatusHistory(input: {
  vehicleId: number;
  fromStatus: VehicleStatus | null;
  toStatus: VehicleStatus;
  eventType: VehicleFlowEvent;
  actorUserId: number | null;
  repairJobId?: number;
  sessionId?: number;
  note?: string;
}) {
  const db = await requireDatabase();
  await db.insert(vehicleStatusHistory).values({
    vehicleId: input.vehicleId,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    eventType: input.eventType,
    actorUserId: input.actorUserId,
    repairJobId: input.repairJobId ?? null,
    sessionId: input.sessionId ?? null,
    note: input.note ?? null,
  });
}

async function updateVehicleStatus(input: {
  vehicleId: number;
  toStatus: VehicleStatus;
  eventType: VehicleFlowEvent;
  actor: VehicleActor | null;
  note?: string;
  repairJobId?: number;
  sessionId?: number;
}) {
  const { db, vehicle } = await getVehicleContext(input.vehicleId);
  if (vehicle.status === input.toStatus) return vehicle;

  if (input.actor) {
    const membershipRole = await getMembershipRole(input.actor.id, vehicle.groupId);
    assertVehicleTransition({
      from: vehicle.status,
      to: input.toStatus,
      eventType: input.eventType,
      appRole: input.actor.role,
      membershipRole,
    });
  } else {
    assertVehicleTransition({
      from: vehicle.status,
      to: input.toStatus,
      eventType: input.eventType,
      appRole: "user",
      membershipRole: null,
    });
  }

  await db.update(vehicles).set({ status: input.toStatus }).where(eq(vehicles.id, input.vehicleId));
  await appendStatusHistory({
    vehicleId: input.vehicleId,
    fromStatus: vehicle.status,
    toStatus: input.toStatus,
    eventType: input.eventType,
    actorUserId: input.actor?.id ?? null,
    repairJobId: input.repairJobId,
    sessionId: input.sessionId,
    note: input.note,
  });
  return { ...vehicle, status: input.toStatus };
}

export async function listVehicleSummary() {
  const db = await requireDatabase();
  return db
    .select({
      id: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      engineCc: vehicles.engineCc,
      status: vehicles.status,
      groupId: vehicles.groupId,
      groupCode: vehicleGroups.code,
      groupName: vehicleGroups.name,
      updatedAt: vehicles.updatedAt,
    })
    .from(vehicles)
    .innerJoin(vehicleGroups, eq(vehicles.groupId, vehicleGroups.id));
}

export async function reportVehicleRepair(input: { vehicleId: number; actor: VehicleActor; description: string }) {
  const { db } = await getVehicleContext(input.vehicleId);
  const inserted = await db.insert(repairJobs).values({
    vehicleId: input.vehicleId,
    description: input.description,
    reportedByUserId: input.actor.id,
  });
  const repairJobId = Number(inserted[0].insertId);
  await updateVehicleStatus({
    vehicleId: input.vehicleId,
    toStatus: "repair",
    eventType: "guide_reported_repair",
    actor: input.actor,
    note: input.description,
    repairJobId,
  });
  return { repairJobId };
}

export async function markVehicleForPickup(input: { vehicleId: number; actor: VehicleActor; note: string }) {
  const { db, vehicle } = await getVehicleContext(input.vehicleId);
  const repairRows = await db
    .select({ id: repairJobs.id, status: repairJobs.status })
    .from(repairJobs)
    .where(and(eq(repairJobs.vehicleId, input.vehicleId), inArray(repairJobs.status, ["open", "in_progress"])))
    .limit(1);
  let repairJobId = repairRows[0]?.id;

  if (!repairJobId) {
    const inserted = await db.insert(repairJobs).values({
      vehicleId: input.vehicleId,
      description: input.note,
      reportedByUserId: input.actor.id,
      completedByUserId: input.actor.id,
      completedAt: new Date(),
      status: "completed",
    });
    repairJobId = Number(inserted[0].insertId);
  } else {
    await db.update(repairJobs).set({
      status: "completed",
      completedByUserId: input.actor.id,
      completedAt: new Date(),
    }).where(eq(repairJobs.id, repairJobId));
  }

  await updateVehicleStatus({
    vehicleId: input.vehicleId,
    toStatus: "pickup",
    eventType: "mechanic_marked_pickup",
    actor: input.actor,
    note: input.note,
    repairJobId,
  });

  const guides = await db
    .select({ userId: vehicleGroupMembers.userId })
    .from(vehicleGroupMembers)
    .where(and(eq(vehicleGroupMembers.groupId, vehicle.groupId), eq(vehicleGroupMembers.memberRole, "guide")))
    .limit(2);
  if (guides.length) {
    await db.insert(vehicleNotifications).values(guides.map(guide => ({
      vehicleId: input.vehicleId,
      recipientUserId: guide.userId,
      type: "pickup_ready" as const,
    })));
  }
  return { repairJobId, notifiedGuideCount: guides.length };
}

export async function completeVehicleRepairWithoutPickup(input: { vehicleNumber: number; actor: VehicleActor; note: string }) {
  const vehicleId = await getVehicleIdByNumber(input.vehicleNumber);
  const { db, vehicle } = await getVehicleContext(vehicleId);
  const repairRows = await db
    .select({ id: repairJobs.id, status: repairJobs.status })
    .from(repairJobs)
    .where(and(eq(repairJobs.vehicleId, vehicleId), inArray(repairJobs.status, ["open", "in_progress"])))
    .limit(1);
  const repairJobId = repairRows[0]?.id;
  if (!repairJobId) throw new VehicleFlowRuleError("ไม่พบรายการซ่อมที่กำลังดำเนินการของรถคันนี้");

  await db.update(repairJobs).set({
    status: "completed",
    completedByUserId: input.actor.id,
    completedAt: new Date(),
  }).where(eq(repairJobs.id, repairJobId));

  await updateVehicleStatus({
    vehicleId,
    toStatus: "ready",
    eventType: "repair_completed_without_pickup",
    actor: input.actor,
    note: input.note,
    repairJobId,
  });

  return { repairJobId, previousStatus: vehicle.status, status: "ready" as const };
}

export async function receivePickupVehicle(input: { vehicleId: number; actor: VehicleActor }) {
  const { db } = await getVehicleContext(input.vehicleId);
  await updateVehicleStatus({
    vehicleId: input.vehicleId,
    toStatus: "ready",
    eventType: "guide_received_vehicle",
    actor: input.actor,
  });
  await db.update(vehicleNotifications).set({ readAt: new Date() }).where(and(
    eq(vehicleNotifications.vehicleId, input.vehicleId),
    eq(vehicleNotifications.recipientUserId, input.actor.id),
    eq(vehicleNotifications.type, "pickup_ready"),
  ));
}

export async function createVehicleSession(input: {
  actor: VehicleActor;
  sessionCode: string;
  durationMinutes: number;
  vehicleIds: number[];
  startImmediately: boolean;
}) {
  const db = await requireDatabase();
  const inserted = await db.insert(vehicleSessions).values({
    sessionCode: input.sessionCode,
    status: input.startImmediately ? "active" : "standby",
    durationMinutes: input.durationMinutes,
    createdByUserId: input.actor.id,
    startedAt: input.startImmediately ? new Date() : null,
  });
  const sessionId = Number(inserted[0].insertId);
  await db.insert(vehicleSessionVehicles).values(input.vehicleIds.map(vehicleId => ({ sessionId, vehicleId })));
  for (const vehicleId of input.vehicleIds) {
    await updateVehicleStatus({
      vehicleId,
      toStatus: "active",
      eventType: input.startImmediately ? "session_started" : "standby_created",
      actor: input.actor,
      sessionId,
    });
  }
  return { sessionId };
}

export async function activateVehicleSession(input: { sessionId: number; actor: VehicleActor }) {
  const db = await requireDatabase();
  const session = (await db.select().from(vehicleSessions).where(eq(vehicleSessions.id, input.sessionId)).limit(1))[0];
  if (!session) throw new Error("ไม่พบรายการ Session");
  if (session.status !== "standby") throw new VehicleFlowRuleError("Session นี้ไม่อยู่ในสถานะ Standby");
  await db.update(vehicleSessions).set({ status: "active", startedAt: new Date() }).where(eq(vehicleSessions.id, input.sessionId));
}

export async function cancelVehicleSession(input: { sessionId: number; actor: VehicleActor }) {
  const db = await requireDatabase();
  const session = (await db.select().from(vehicleSessions).where(eq(vehicleSessions.id, input.sessionId)).limit(1))[0];
  if (!session) throw new Error("ไม่พบรายการ Session");
  if (session.status !== "standby") throw new VehicleFlowRuleError("ยกเลิกได้เฉพาะรายการที่อยู่ในสถานะ Standby");
  if (input.actor.role !== "admin" && input.actor.role !== "supervisor" && session.createdByUserId !== input.actor.id) {
    throw new VehicleFlowRuleError("เฉพาะผู้สร้างรายการหรือหัวหน้าเท่านั้นที่ยกเลิก Standby ได้");
  }
  const cancelledAt = new Date();
  await db.update(vehicleSessions).set({ status: "cancelled", completedAt: cancelledAt }).where(and(
    eq(vehicleSessions.id, session.id),
    eq(vehicleSessions.status, "standby"),
  ));
  const vehicleLinks = await db.select({ vehicleId: vehicleSessionVehicles.vehicleId })
    .from(vehicleSessionVehicles)
    .where(eq(vehicleSessionVehicles.sessionId, session.id));
  let returnedVehicleCount = 0;
  for (const link of vehicleLinks) {
    const vehicle = (await db.select().from(vehicles).where(eq(vehicles.id, link.vehicleId)).limit(1))[0];
    if (!vehicle || vehicle.status !== "active") continue;
    await updateVehicleStatus({
      vehicleId: vehicle.id,
      toStatus: "ready",
      eventType: "session_cancelled",
      actor: input.actor,
      sessionId: session.id,
      note: "ยกเลิกรายการ Standby และคืนรถเป็นพร้อมใช้",
    });
    returnedVehicleCount += 1;
  }
  return { returnedVehicleCount };
}

export async function completeVehicleSession(input: { sessionId: number; actor: VehicleActor | null; completedAt?: Date }) {
  const db = await requireDatabase();
  const session = (await db.select().from(vehicleSessions).where(eq(vehicleSessions.id, input.sessionId)).limit(1))[0];
  if (!session) throw new Error("ไม่พบรายการ Session");
  if (session.status !== "active") throw new VehicleFlowRuleError("Session นี้ไม่อยู่ในสถานะ Active");
  if (input.actor && input.actor.role !== "admin" && input.actor.role !== "supervisor" && session.createdByUserId !== input.actor.id) {
    throw new VehicleFlowRuleError("เฉพาะผู้สร้าง Session หรือผู้ดูแลระบบเท่านั้นที่จบงานได้");
  }
  const completedAt = input.completedAt ?? new Date();
  await db.update(vehicleSessions).set({ status: "completed", completedAt }).where(and(
    eq(vehicleSessions.id, session.id),
    eq(vehicleSessions.status, "active"),
  ));
  const vehicleLinks = await db.select({ vehicleId: vehicleSessionVehicles.vehicleId })
    .from(vehicleSessionVehicles)
    .where(eq(vehicleSessionVehicles.sessionId, session.id));
  let returnedVehicleCount = 0;
  for (const link of vehicleLinks) {
    const vehicle = (await db.select().from(vehicles).where(eq(vehicles.id, link.vehicleId)).limit(1))[0];
    if (!vehicle || vehicle.status !== "active") continue;
    await updateVehicleStatus({
      vehicleId: vehicle.id,
      toStatus: "ready",
      eventType: "session_completed",
      actor: input.actor,
      sessionId: session.id,
      note: input.actor ? "ผู้ใช้งานจบ Session และคืนรถเป็นพร้อมใช้" : "ครบเวลาตาม Session ระบบคืนรถเป็นพร้อมใช้โดยอัตโนมัติ",
    });
    returnedVehicleCount += 1;
  }
  return { returnedVehicleCount };
}

export async function reconcileExpiredVehicleSessions(now = new Date()) {
  const db = await requireDatabase();
  const activeSessions = await db.select().from(vehicleSessions).where(eq(vehicleSessions.status, "active"));
  const expired = activeSessions.filter(session => session.startedAt && session.startedAt.getTime() + session.durationMinutes * 60_000 <= now.getTime());
  let returnedVehicleCount = 0;

  for (const session of expired) {
    const result = await completeVehicleSession({ sessionId: session.id, actor: null, completedAt: now });
    returnedVehicleCount += result.returnedVehicleCount;
  }
  return { expiredSessionCount: expired.length, returnedVehicleCount };
}

export type ActiveQueueItem = {
  position: number;
  sessionId: number;
  sessionCode: string;
  startedAt: Date | null;
  durationMinutes: number;
  elapsedSeconds: number;
  remainingSeconds: number;
  vehicles: Array<{ id: number; number: number; engineCc: "200" | "250"; groupName: string }>;
};

export function buildActiveQueue<T extends {
  sessionId: number;
  sessionCode: string;
  startedAt: Date | null;
  createdAt: Date;
  durationMinutes: number;
  vehicleId: number;
  vehicleNumber: number;
  engineCc: "200" | "250";
  groupName: string;
}>(rows: T[], now = new Date()): ActiveQueueItem[] {
  const grouped = new Map<number, Omit<ActiveQueueItem, "position" | "elapsedSeconds" | "remainingSeconds">>();
  for (const row of rows) {
    const current = grouped.get(row.sessionId) ?? {
      sessionId: row.sessionId,
      sessionCode: row.sessionCode,
      startedAt: row.startedAt,
      durationMinutes: row.durationMinutes,
      vehicles: [],
    };
    current.vehicles.push({ id: row.vehicleId, number: row.vehicleNumber, engineCc: row.engineCc, groupName: row.groupName });
    grouped.set(row.sessionId, current);
  }
  return Array.from(grouped.values())
    .sort((left, right) => (left.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) - (right.startedAt?.getTime() ?? Number.MAX_SAFE_INTEGER) || left.sessionId - right.sessionId)
    .map((item, index) => {
      const elapsedSeconds = item.startedAt ? Math.max(0, Math.floor((now.getTime() - item.startedAt.getTime()) / 1_000)) : 0;
      return {
        ...item,
        position: index + 1,
        elapsedSeconds,
        remainingSeconds: Math.max(0, item.durationMinutes * 60 - elapsedSeconds),
      };
    });
}

export async function listActiveQueue(now = new Date()) {
  const db = await requireDatabase();
  const rows = await db
    .select({
      sessionId: vehicleSessions.id,
      sessionCode: vehicleSessions.sessionCode,
      startedAt: vehicleSessions.startedAt,
      createdAt: vehicleSessions.createdAt,
      durationMinutes: vehicleSessions.durationMinutes,
      vehicleId: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      engineCc: vehicles.engineCc,
      groupName: vehicleGroups.name,
    })
    .from(vehicleSessions)
    .innerJoin(vehicleSessionVehicles, eq(vehicleSessionVehicles.sessionId, vehicleSessions.id))
    .innerJoin(vehicles, eq(vehicleSessionVehicles.vehicleId, vehicles.id))
    .innerJoin(vehicleGroups, eq(vehicles.groupId, vehicleGroups.id))
    .where(eq(vehicleSessions.status, "active"));
  return buildActiveQueue(rows, now);
}

export async function getUnreadPickupNotifications(userId: number) {
  const db = await requireDatabase();
  return db
    .select({
      id: vehicleNotifications.id,
      vehicleId: vehicles.id,
      vehicleNumber: vehicles.vehicleNumber,
      engineCc: vehicles.engineCc,
      groupName: vehicleGroups.name,
      createdAt: vehicleNotifications.createdAt,
    })
    .from(vehicleNotifications)
    .innerJoin(vehicles, eq(vehicleNotifications.vehicleId, vehicles.id))
    .innerJoin(vehicleGroups, eq(vehicles.groupId, vehicleGroups.id))
    .where(and(
      eq(vehicleNotifications.recipientUserId, userId),
      eq(vehicleNotifications.type, "pickup_ready"),
      isNull(vehicleNotifications.readAt),
    ));
}
