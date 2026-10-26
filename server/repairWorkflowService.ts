import { appendOperationalHistory, getAppOperationsSnapshot, upsertAppOperationsSnapshot } from "./db";

export const REPAIR_WORKFLOW_SNAPSHOT_KEY = "atv-repair-workflow-v1";

export const REPAIR_WORKFLOW_STATUSES = [
  "reported",
  "assessing",
  "waiting_parts_unavailable",
  "waiting_parts_usable",
  "repairing",
  "completed",
] as const;

export type RepairWorkflowStatus = typeof REPAIR_WORKFLOW_STATUSES[number];
export type RepairWorkflowSource = "manual-alert" | "guide-report" | "waiting-parts-usable";

export type RepairWorkflowItem = {
  id: string;
  source: RepairWorkflowSource;
  sourceRepairReportId?: string;
  vehicleNumber: number;
  description: string;
  reporter: string;
  requestedPart?: string;
  status: RepairWorkflowStatus;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

type RepairWorkflowSnapshot = {
  version: 1;
  updatedAt: string;
  items: RepairWorkflowItem[];
};

function emptySnapshot(): RepairWorkflowSnapshot {
  return { version: 1, updatedAt: new Date(0).toISOString(), items: [] };
}

function parseSnapshot(payload?: string | null): RepairWorkflowSnapshot {
  if (!payload) return emptySnapshot();
  try {
    const value = JSON.parse(payload) as Partial<RepairWorkflowSnapshot>;
    if (!Array.isArray(value.items)) return emptySnapshot();
    const items = value.items.filter(item => item && typeof item === "object" && typeof item.id === "string" && typeof item.vehicleNumber === "number" && typeof item.description === "string" && typeof item.status === "string") as RepairWorkflowItem[];
    return { version: 1, updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(), items };
  } catch {
    return emptySnapshot();
  }
}

async function readSnapshot() {
  return parseSnapshot(await getAppOperationsSnapshot(REPAIR_WORKFLOW_SNAPSHOT_KEY));
}

async function writeSnapshot(snapshot: RepairWorkflowSnapshot, eventType: string, item: RepairWorkflowItem, actorDirectoryUserId?: number) {
  const payload = JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() });
  await upsertAppOperationsSnapshot(REPAIR_WORKFLOW_SNAPSHOT_KEY, payload);
  await appendOperationalHistory({
    eventType,
    module: "mechanic",
    actorDirectoryUserId,
    payload: JSON.stringify({ repairItemId: item.id, source: item.source, sourceRepairReportId: item.sourceRepairReportId, vehicleNumber: item.vehicleNumber, status: item.status, requestedPart: item.requestedPart }),
  });
  return item;
}

export async function listRepairWorkflowItems() {
  return (await readSnapshot()).items;
}

export async function createRepairWorkflowItem(input: Omit<RepairWorkflowItem, "createdAt" | "updatedAt" | "status"> & { status?: RepairWorkflowStatus }, actorDirectoryUserId?: number) {
  const snapshot = await readSnapshot();
  const now = new Date().toISOString();
  const item: RepairWorkflowItem = { ...input, status: input.status ?? "reported", createdAt: now, updatedAt: now };
  if (snapshot.items.some(existing => existing.id === item.id)) throw new Error("รายการแจ้งซ่อม ID นี้มีอยู่แล้ว");
  snapshot.items = [item, ...snapshot.items];
  return writeSnapshot(snapshot, "repair_workflow_created", item, actorDirectoryUserId);
}

export async function transitionRepairWorkflowItem(input: { id: string; status: RepairWorkflowStatus; requestedPart?: string; note?: string }, actorDirectoryUserId?: number) {
  const snapshot = await readSnapshot();
  const index = snapshot.items.findIndex(item => item.id === input.id);
  if (index < 0) throw new Error("ไม่พบรายการแจ้งซ่อมใน Backend");
  const current = snapshot.items[index];
  const updated: RepairWorkflowItem = { ...current, status: input.status, requestedPart: input.requestedPart ?? current.requestedPart, updatedAt: new Date().toISOString(), ...(input.status === "completed" ? { completedAt: new Date().toISOString() } : {}) };
  snapshot.items[index] = updated;
  return writeSnapshot(snapshot, `repair_workflow_${input.status}`, updated, actorDirectoryUserId);
}

export async function completeRepairWorkflowItem(id: string, actorDirectoryUserId?: number) {
  return transitionRepairWorkflowItem({ id, status: "completed" }, actorDirectoryUserId);
}
