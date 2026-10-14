import { extractGuideVehicleNumber, normalizeGuideRepairReports, pendingGuideRepairVehicleNumbers, type GuideRepairCompletionRecord, type GuideRepairReport } from "@/lib/mechanic-guide-repair";
import type { VehicleResponsibilityState } from "@/lib/vehicle-responsibility-store";

export type SupervisorVehicleStatus = "ready" | "repair" | "inspection" | "pickup" | "active";

export type SupervisorDatabaseStatusSummary = {
  total: number;
  ready: number;
  repair: number;
  inspection: number;
  pickup: number;
  active: number;
};

export function getSupervisorVehicleStatus(group: { inUse?: number[]; pickup?: number[]; unavailable?: number[] }, number: number): SupervisorVehicleStatus {
  if (group.inUse?.includes(number)) return "active";
  if (group.pickup?.includes(number)) return "pickup";
  if (group.unavailable?.includes(number)) return "repair";
  return "ready";
}

export function supervisorStatusLabel(status: SupervisorVehicleStatus) {
  return status === "ready" ? "พร้อมใช้" : status === "repair" ? "ซ่อม" : status === "inspection" ? "คำแนะนำ" : status === "pickup" ? "แจ้งรับรถ" : "กำลังใช้งาน";
}

export function countGuidanceVehicles(vehicleNumbers: number[], notices: Array<{ vehicleNumber: number }>) {
  const allowed = new Set(vehicleNumbers);
  return new Set(notices.map(notice => notice.vehicleNumber).filter(number => allowed.has(number))).size;
}

/** The Mechanic warning tab's "เลขรถ" column is the canonical guidance vehicle set. */
export function vehicleNumbersFromMechanicWarningTab(rows: Array<{ vehicleNumber: number }>) {
  return Array.from(new Set(rows.map(row => Number(row.vehicleNumber)).filter(number => Number.isInteger(number) && number > 0)));
}

export function summarizeSupervisorStatuses(statuses: SupervisorVehicleStatus[]) {
  return statuses.reduce((summary, status) => ({ ...summary, total: summary.total + 1, [status]: summary[status] + 1 }), { total: 0, ready: 0, repair: 0, inspection: 0, pickup: 0, active: 0 });
}

export function pickupRequestsInResponsibilityGroups<T extends { vehicleNumber: number }>(
  requests: T[],
  groups: Array<{ vehicleNumbers: number[] }>,
): T[] {
  const groupedVehicleNumbers = new Set(groups.flatMap(group => group.vehicleNumbers));
  return requests.filter(request => groupedVehicleNumbers.has(request.vehicleNumber));
}

export type SupervisorVehicleCc = "200" | "250";

export type SupervisorDatabaseStatusSource = {
  vehicleNumbers: number[];
  vehicleCcByNumber?: Record<number, SupervisorVehicleCc>;
  guideReports: GuideRepairReport[];
  mechanicRepairs: GuideRepairCompletionRecord[];
  guidanceVehicleNumbers: number[];
  pickupVehicleNumbers: number[];
  activeVehicleNumbers: number[];
};

/**
 * Inputs for the canonical status source. Every field must come from a Server
 * snapshot/query or from state already hydrated from one. This type deliberately
 * has no Browser-storage reader or fallback.
 */
export type SupervisorServerStatusInput = {
  vehicleDatabase?: Array<{ number: number; cc: SupervisorVehicleCc }>;
  vehicleState?: VehicleResponsibilityState;
  guideReports?: unknown;
  mechanicRepairs?: unknown;
  guidanceVehicleNumbers?: unknown;
  pickupVehicleNumbers?: unknown;
  activeVehicleNumbers?: unknown;
};

export type SupervisorStatusNumberSets = {
  ready: Set<number>;
  repair: Set<number>;
  inspection: Set<number>;
  pickup: Set<number>;
  active: Set<number>;
  total: Set<number>;
};

export type SupervisorCcStatusModel = {
  summary: SupervisorDatabaseStatusSummary;
  numbers: SupervisorStatusNumberSets;
};

export type SupervisorUserDirectoryStatusModel = {
  source: SupervisorDatabaseStatusSource;
  numbers: SupervisorStatusNumberSets;
  summary: SupervisorDatabaseStatusSummary;
  byCc: Record<SupervisorVehicleCc, SupervisorCcStatusModel>;
};

function positiveNumbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map(Number).filter(number => Number.isInteger(number) && number > 0)));
}

function normalizeCompletionRecords(value: unknown): GuideRepairCompletionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const record = item as Partial<GuideRepairCompletionRecord>;
    if (!Number.isInteger(Number(record.vehicleNumber)) || typeof record.createdAt !== "string") return [];
    return [{
      sourceGuideRepairId: typeof record.sourceGuideRepairId === "string" ? record.sourceGuideRepairId : undefined,
      vehicleNumber: Number(record.vehicleNumber),
      createdAt: record.createdAt,
    }];
  });
}

/**
 * Builds the one status input used by Guide, Mechanic and Supervisor. It is a
 * pure transformer: no localStorage/sessionStorage access is allowed here.
 */
export function buildSupervisorUserDirectoryStatusSource(input: SupervisorServerStatusInput = {}): SupervisorDatabaseStatusSource {
  const vehicleCcByNumber: Record<number, SupervisorVehicleCc> = {};
  const vehicleNumbers = new Set<number>();
  input.vehicleDatabase?.forEach(vehicle => {
    const number = Number(vehicle.number);
    if (!Number.isInteger(number) || number <= 0 || (vehicle.cc !== "200" && vehicle.cc !== "250")) return;
    vehicleNumbers.add(number);
    vehicleCcByNumber[number] = vehicle.cc;
  });
  input.vehicleState?.vehicleGroups.forEach(group => {
    const cc = group.cc.replace(/cc/gi, "") as SupervisorVehicleCc;
    if (cc !== "200" && cc !== "250") return;
    group.numbers.forEach(rawNumber => {
      const number = Number(rawNumber);
      if (!Number.isInteger(number) || number <= 0) return;
      vehicleNumbers.add(number);
      vehicleCcByNumber[number] ??= cc;
    });
  });

  return {
    vehicleNumbers: Array.from(vehicleNumbers).sort((a, b) => a - b),
    vehicleCcByNumber,
    guideReports: normalizeGuideRepairReports(input.guideReports),
    mechanicRepairs: normalizeCompletionRecords(input.mechanicRepairs),
    guidanceVehicleNumbers: positiveNumbers(input.guidanceVehicleNumbers),
    pickupVehicleNumbers: positiveNumbers(input.pickupVehicleNumbers),
    activeVehicleNumbers: positiveNumbers(input.activeVehicleNumbers),
  };
}

/**
 * Backward-compatible name retained for existing module contracts. It is now a
 * pure builder and does not read Browser storage; callers must provide Server
 * snapshot data explicitly.
 */
export function readSupervisorUserDirectoryStatusSource(input: SupervisorServerStatusInput = {}) {
  return buildSupervisorUserDirectoryStatusSource(input);
}

export function getSupervisorStatusNumberSets(source: SupervisorDatabaseStatusSource): SupervisorStatusNumberSets {
  const total = new Set(source.vehicleNumbers.filter(number => Number.isInteger(number) && number > 0));
  const scoped = (numbers: number[]) => new Set(numbers.filter(number => total.has(number)));
  const active = scoped(source.activeVehicleNumbers);
  const pickup = scoped(source.pickupVehicleNumbers);
  const repair = scoped(Array.from(pendingGuideRepairVehicleNumbers(source.guideReports, source.mechanicRepairs)));
  const inspection = scoped(source.guidanceVehicleNumbers);

  active.forEach(number => {
    pickup.delete(number);
    repair.delete(number);
  });
  pickup.forEach(number => repair.delete(number));

  const unavailable = new Set(Array.from(active).concat(Array.from(pickup), Array.from(repair)));
  const ready = new Set(Array.from(total).filter(number => !unavailable.has(number)));
  return { ready, repair, inspection, pickup, active, total };
}

export function resolveSupervisorOperationalStatus(number: number, numbers: SupervisorStatusNumberSets): SupervisorVehicleStatus {
  if (numbers.active.has(number)) return "active";
  if (numbers.pickup.has(number)) return "pickup";
  if (numbers.repair.has(number)) return "repair";
  return "ready";
}

/** Builds the exact vehicle list used by the 2.1 creators. */
export type SupervisorInputVehicle = {
  number: number;
  cc: SupervisorVehicleCc;
  status: SupervisorVehicleStatus;
};

export function buildSupervisorInputVehicles(model: SupervisorUserDirectoryStatusModel): SupervisorInputVehicle[] {
  return Array.from(model.numbers.total)
    .sort((a, b) => a - b)
    .flatMap(number => {
      const cc = model.source.vehicleCcByNumber?.[number];
      return cc ? [{
        number,
        cc,
        status: model.numbers.inspection.has(number) && model.numbers.ready.has(number)
          ? "inspection" as SupervisorVehicleStatus
          : resolveSupervisorOperationalStatus(number, model.numbers),
      }] : [];
    });
}

export function buildSupervisorUserDirectoryStatusModel(source: SupervisorDatabaseStatusSource): SupervisorUserDirectoryStatusModel {
  const numbers = getSupervisorStatusNumberSets(source);
  const summaryForNumbers = (scopedNumbers: SupervisorStatusNumberSets): SupervisorDatabaseStatusSummary => ({
    total: scopedNumbers.total.size,
    ready: scopedNumbers.ready.size,
    repair: scopedNumbers.repair.size,
    inspection: scopedNumbers.inspection.size,
    pickup: scopedNumbers.pickup.size,
    active: scopedNumbers.active.size,
  });
  const byCc = (["200", "250"] as const).reduce<Record<SupervisorVehicleCc, SupervisorCcStatusModel>>((result, cc) => {
    const scoped = (values: Set<number>) => new Set(Array.from(values).filter(number => source.vehicleCcByNumber?.[number] === cc));
    const scopedNumbers = {
      ready: scoped(numbers.ready),
      repair: scoped(numbers.repair),
      inspection: scoped(numbers.inspection),
      pickup: scoped(numbers.pickup),
      active: scoped(numbers.active),
      total: scoped(numbers.total),
    };
    result[cc] = { numbers: scopedNumbers, summary: summaryForNumbers(scopedNumbers) };
    return result;
  }, {} as Record<SupervisorVehicleCc, SupervisorCcStatusModel>);
  return { source, numbers, summary: summaryForNumbers(numbers), byCc };
}

/** Builds the exact summary consumed by Supervisor > Database > Users metrics. */
export function buildSupervisorDatabaseStatusSummary(source: SupervisorDatabaseStatusSource): SupervisorDatabaseStatusSummary {
  return buildSupervisorUserDirectoryStatusModel(source).summary;
}

export function summarizeSupervisorDatabaseStatus(
  vehicleNumbers: number[],
  repairVehicleNumbers: number[],
  guidanceVehicleNumbers: number[],
  pickupVehicleNumbers: number[],
  activeVehicleNumbers: number[],
): SupervisorDatabaseStatusSummary {
  const allowed = new Set(vehicleNumbers.filter(number => Number.isInteger(number) && number > 0));
  const inScope = (numbers: number[]) => new Set(numbers.filter(number => allowed.has(number)));
  const active = inScope(activeVehicleNumbers);
  const pickup = inScope(pickupVehicleNumbers);
  const repair = inScope(repairVehicleNumbers);
  const guidance = inScope(guidanceVehicleNumbers);
  active.forEach(number => {
    pickup.delete(number);
    repair.delete(number);
  });
  pickup.forEach(number => repair.delete(number));
  const unavailable = new Set(Array.from(active).concat(Array.from(pickup), Array.from(repair)));
  return {
    total: allowed.size,
    ready: Math.max(0, allowed.size - unavailable.size),
    repair: repair.size,
    inspection: guidance.size,
    pickup: pickup.size,
    active: active.size,
  };
}
