import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { mechanicRepairRecords } from "../drizzle/schema";
import { getAppOperationsSnapshot, getDb, upsertAppOperationsSnapshot } from "./db";

type RepairStatus = "กำลังซ่อม" | "แจ้งรับรถ" | "เสร็จแล้ว";
type RepairDecision = "แจ้งรับรถ" | "ไม่แจ้งรับรถ";
const LEGACY_IMPORT_MARKER = "atv-mechanic-repairs-migrated-v1";

type RepairRecordInput = {
  vehicleNumber: number;
  symptom: string;
  parts: string;
  technician: string;
  decision?: RepairDecision;
  sourceGuideRepairId?: string;
  accumulatedHoursAtRepair?: number;
};

type RepairRecordRow = typeof mechanicRepairRecords.$inferSelect;
export type MechanicRepairRecord = Omit<RepairRecordRow, "createdAt" | "updatedAt" | "exportedAt" | "archivedAt" | "decision" | "status"> & {
  decision: RepairDecision | null;
  status: RepairStatus;
  createdAt: string;
  updatedAt: string;
  exportedAt?: string;
};

function toApiRecord(row: RepairRecordRow): MechanicRepairRecord {
  return {
    ...row,
    decision: row.decision === "แจ้งรับรถ" || row.decision === "ไม่แจ้งรับรถ" ? row.decision : null,
    status: row.status === "กำลังซ่อม" || row.status === "แจ้งรับรถ" || row.status === "เสร็จแล้ว" ? row.status : "เสร็จแล้ว",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    exportedAt: row.exportedAt?.toISOString(),
  };
}

function toValidDate(value: unknown, fallback: Date): Date {
  if (typeof value !== "string") return fallback;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

/** Converts old mechanicState snapshot entries into canonical DB rows without trusting malformed data. */
export function normalizeLegacyMechanicRepair(value: unknown, now = new Date()) {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const vehicleNumber = Number(item.vehicleNumber);
  const symptom = typeof item.symptom === "string" ? item.symptom.trim() : "";
  const technician = typeof item.technician === "string" ? item.technician.trim() : "";
  const status = typeof item.status === "string" ? item.status.trim() : "";
  if (!id || id.length > 128 || !Number.isInteger(vehicleNumber) || vehicleNumber < 1 || !symptom || symptom.length > 20_000 || !technician || technician.length > 128 || !(status === "กำลังซ่อม" || status === "แจ้งรับรถ" || status === "เสร็จแล้ว")) return undefined;
  const createdAt = toValidDate(item.createdAt, now);
  const updatedAt = toValidDate(item.updatedAt, createdAt);
  const accumulatedHours = Number(item.accumulatedHoursAtRepair);
  return {
    id,
    vehicleNumber,
    symptom,
    parts: typeof item.parts === "string" ? item.parts.slice(0, 20_000) : "",
    technician,
    decision: item.decision === "แจ้งรับรถ" || item.decision === "ไม่แจ้งรับรถ" ? item.decision : null,
    status,
    createdAt,
    updatedAt,
    sourceGuideRepairId: typeof item.sourceGuideRepairId === "string" ? item.sourceGuideRepairId.slice(0, 128) : null,
    accumulatedHoursAtRepair: Number.isFinite(accumulatedHours) ? accumulatedHours : null,
    exportedAt: null,
    archivedAt: null,
  };
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("ฐานข้อมูลยังไม่พร้อมใช้งาน");
  return db;
}

/** One-way, idempotent compatibility import. Duplicate legacy IDs never overwrite canonical DB data. */
async function importLegacyMechanicRepairs(db: Awaited<ReturnType<typeof requireDb>>) {
  if (await getAppOperationsSnapshot(LEGACY_IMPORT_MARKER)) return;
  const payload = await getAppOperationsSnapshot("atv-mechanic-state-v1");
  let value: unknown;
  if (payload) {
    try {
      value = JSON.parse(payload);
    } catch {
      value = undefined;
    }
  }
  const legacyRows = value && typeof value === "object" && Array.isArray((value as { repairs?: unknown }).repairs)
    ? ((value as { repairs: unknown[] }).repairs.map(item => normalizeLegacyMechanicRepair(item)).filter((item): item is NonNullable<typeof item> => Boolean(item)))
    : [];
  for (let offset = 0; offset < legacyRows.length; offset += 250) {
    const batch = legacyRows.slice(offset, offset + 250);
    if (batch.length) await db.insert(mechanicRepairRecords).values(batch).onDuplicateKeyUpdate({ set: { id: sql`${mechanicRepairRecords.id}` } });
  }
  await upsertAppOperationsSnapshot(LEGACY_IMPORT_MARKER, JSON.stringify({ completedAt: new Date().toISOString() }));
}

function statusForDecision(decision?: RepairDecision): RepairStatus {
  return decision === "แจ้งรับรถ" ? "แจ้งรับรถ" : "เสร็จแล้ว";
}

export async function listMechanicRepairRecords(): Promise<MechanicRepairRecord[]> {
  const db = await requireDb();
  await importLegacyMechanicRepairs(db);
  const rows = await db.select().from(mechanicRepairRecords)
    .where(isNull(mechanicRepairRecords.archivedAt))
    .orderBy(desc(mechanicRepairRecords.createdAt), desc(mechanicRepairRecords.updatedAt));
  return rows.map(toApiRecord);
}

export async function createMechanicRepairRecord(input: RepairRecordInput): Promise<MechanicRepairRecord> {
  const db = await requireDb();
  const now = new Date();
  const row = {
    id: `RP-${randomUUID()}`,
    vehicleNumber: input.vehicleNumber,
    symptom: input.symptom.trim(),
    parts: input.parts.trim(),
    technician: input.technician.trim(),
    decision: input.decision ?? null,
    status: statusForDecision(input.decision),
    createdAt: now,
    updatedAt: now,
    sourceGuideRepairId: input.sourceGuideRepairId ?? null,
    accumulatedHoursAtRepair: input.accumulatedHoursAtRepair ?? null,
    exportedAt: null,
    archivedAt: null,
  };
  await db.insert(mechanicRepairRecords).values(row);
  const saved = await db.select().from(mechanicRepairRecords).where(eq(mechanicRepairRecords.id, row.id)).limit(1);
  if (!saved[0]) throw new Error("บันทึกรายการซ่อมไม่สำเร็จ");
  return toApiRecord(saved[0]);
}

export async function updateMechanicRepairRecord(id: string, input: RepairRecordInput): Promise<MechanicRepairRecord> {
  const db = await requireDb();
  const existing = await db.select().from(mechanicRepairRecords).where(and(eq(mechanicRepairRecords.id, id), isNull(mechanicRepairRecords.archivedAt))).limit(1);
  if (!existing[0]) throw new Error("ไม่พบรายการซ่อมที่ต้องการแก้ไข");
  await db.update(mechanicRepairRecords).set({
    vehicleNumber: input.vehicleNumber,
    symptom: input.symptom.trim(),
    parts: input.parts.trim(),
    technician: input.technician.trim(),
    decision: input.decision ?? null,
    status: statusForDecision(input.decision),
    sourceGuideRepairId: input.sourceGuideRepairId ?? null,
    accumulatedHoursAtRepair: input.accumulatedHoursAtRepair ?? null,
    updatedAt: new Date(),
  }).where(eq(mechanicRepairRecords.id, id));
  const saved = await db.select().from(mechanicRepairRecords).where(eq(mechanicRepairRecords.id, id)).limit(1);
  if (!saved[0]) throw new Error("อ่านรายการซ่อมหลังแก้ไขไม่สำเร็จ");
  return toApiRecord(saved[0]);
}

/** Archive rather than physically delete so repair history remains server-owned and recoverable. */
export async function archiveMechanicRepairRecord(id: string): Promise<void> {
  const db = await requireDb();
  const result = await db.update(mechanicRepairRecords).set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(mechanicRepairRecords.id, id), isNull(mechanicRepairRecords.archivedAt)));
  if (!Number(result[0]?.affectedRows ?? 0)) throw new Error("ไม่พบรายการซ่อมที่ต้องการเก็บเข้าคลัง");
}

export async function listPendingMechanicRepairRecords(limit = 1_000): Promise<MechanicRepairRecord[]> {
  const db = await requireDb();
  await importLegacyMechanicRepairs(db);
  const rows = await db.select().from(mechanicRepairRecords)
    .where(and(isNull(mechanicRepairRecords.archivedAt), isNull(mechanicRepairRecords.exportedAt)))
    .orderBy(mechanicRepairRecords.createdAt)
    .limit(limit);
  return rows.map(toApiRecord);
}

export async function markMechanicRepairRecordsExported(ids: string[], exportedAt: Date): Promise<number> {
  if (!ids.length) return 0;
  const db = await requireDb();
  const result = await db.update(mechanicRepairRecords).set({ exportedAt, updatedAt: exportedAt })
    .where(and(inArray(mechanicRepairRecords.id, ids), isNull(mechanicRepairRecords.archivedAt), isNull(mechanicRepairRecords.exportedAt)));
  return Number(result[0]?.affectedRows ?? 0);
}
