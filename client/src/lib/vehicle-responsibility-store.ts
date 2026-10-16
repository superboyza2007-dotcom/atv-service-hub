/* Single source of truth for the vehicle catalog, per-vehicle status, and fleet responsibility mapping. */

export type VehicleCc = "200" | "250";
export type VehicleStatus = "ready" | "repair" | "inspection" | "pickup" | "active";

export type VehicleGroupRecord = {
  cc: string;
  label: string;
  numbers: number[];
  unavailable?: number[];
  notifications?: number[];
  inUse?: number[];
  pickup?: number[];
};

export type ResponsibilityGroupRecord = {
  id: number | string;
  name?: string;
  managers: number[];
  vehicleNumbers: number[];
  color?: string;
};

export type VehicleResponsibilityState = {
  version: 1;
  vehicleGroups: VehicleGroupRecord[];
  responsibilityGroups: ResponsibilityGroupRecord[];
  updatedAt: number;
};

type VehicleStateDraft = Omit<VehicleResponsibilityState, "version" | "updatedAt">;

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const uniqueSorted = (numbers: number[]) => Array.from(new Set(numbers)).sort((a, b) => a - b);
const validNumbers = (value: unknown) => Array.isArray(value) ? uniqueSorted(value.filter((number): number is number => Number.isInteger(number) && number > 0)) : [];

export function normalizeVehicleCc(value: string): VehicleCc | undefined {
  const normalized = value.replace(/cc/gi, "").replace(/\s/g, "");
  return normalized === "200" || normalized === "250" ? normalized : undefined;
}

function normalizeVehicleGroup(group: VehicleGroupRecord): VehicleGroupRecord {
  const numbers = validNumbers(group.numbers);
  const allowed = new Set(numbers);
  const scoped = (value: unknown) => validNumbers(value).filter(number => allowed.has(number));
  const inUse = scoped(group.inUse);
  const pickup = scoped(group.pickup).filter(number => !inUse.includes(number));
  const unavailable = scoped(group.unavailable).filter(number => !inUse.includes(number) && !pickup.includes(number));
  return {
    cc: group.cc,
    label: group.label,
    numbers,
    unavailable,
    notifications: scoped(group.notifications),
    inUse,
    pickup,
  };
}

function normalizeResponsibilityGroup(group: ResponsibilityGroupRecord): ResponsibilityGroupRecord {
  return {
    id: group.id,
    name: typeof group.name === "string" ? group.name : undefined,
    managers: validNumbers(group.managers).slice(0, 2),
    vehicleNumbers: validNumbers(group.vehicleNumbers),
    color: typeof group.color === "string" ? group.color : undefined,
  };
}

export function mergeSupervisorFleetGroups(
  state: VehicleResponsibilityState,
  supervisorGroups: ResponsibilityGroupRecord[] | undefined,
): VehicleResponsibilityState {
  if (supervisorGroups === undefined) return state;
  return { ...state, responsibilityGroups: clone(supervisorGroups).map(normalizeResponsibilityGroup) };
}

export function getVehicleGroupForNumber(number: number, vehicleGroups: VehicleGroupRecord[]) {
  return vehicleGroups.find(group => group.numbers.includes(number));
}

export function getVehicleStatus(number: number, vehicleGroups: VehicleGroupRecord[]): VehicleStatus {
  const group = getVehicleGroupForNumber(number, vehicleGroups);
  if (!group) return "ready";
  if (group.inUse?.includes(number)) return "active";
  if (group.pickup?.includes(number)) return "pickup";
  if (group.unavailable?.includes(number)) return "repair";
  // Safety notices live in the separate vehicle-safety-notices store and never change vehicle status.
  return "ready";
}

export function reconcileActiveVehicleNumbers(
  state: VehicleResponsibilityState | VehicleStateDraft,
  activeVehicleNumbers: number[],
): VehicleStateDraft {
  const active = new Set(validNumbers(activeVehicleNumbers));
  return {
    vehicleGroups: state.vehicleGroups.map(group => normalizeVehicleGroup({
      ...group,
      inUse: group.numbers.filter(number => active.has(number)),
    })),
    responsibilityGroups: clone(state.responsibilityGroups),
  };
}

export function setVehicleStatusForNumbers(
  state: VehicleResponsibilityState | VehicleStateDraft,
  vehicleNumbers: number[],
  status: VehicleStatus,
): VehicleStateDraft {
  const targets = new Set(validNumbers(vehicleNumbers));
  return {
    vehicleGroups: state.vehicleGroups.map(group => {
      const scopedTargets = group.numbers.filter(number => targets.has(number));
      const normalized = normalizeVehicleGroup(group);
      if (!scopedTargets.length) return normalized;
      const scoped = new Set(scopedTargets);
      const next = {
        ...normalized,
        unavailable: (normalized.unavailable ?? []).filter(number => !scoped.has(number)),
        inUse: (normalized.inUse ?? []).filter(number => !scoped.has(number)),
        pickup: (normalized.pickup ?? []).filter(number => !scoped.has(number)),
      };
      if (status === "repair") next.unavailable = uniqueSorted([...(next.unavailable ?? []), ...scopedTargets]);
      if (status === "active") next.inUse = uniqueSorted([...(next.inUse ?? []), ...scopedTargets]);
      if (status === "pickup") next.pickup = uniqueSorted([...(next.pickup ?? []), ...scopedTargets]);
      return normalizeVehicleGroup(next);
    }),
    responsibilityGroups: clone(state.responsibilityGroups),
  };
}

export function addVehicleToResponsibilityState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  number: number,
  cc: VehicleCc,
): VehicleStateDraft {
  const existingGroup = state.vehicleGroups.find(group => normalizeVehicleCc(group.cc) === cc);
  const vehicleGroups = existingGroup
    ? state.vehicleGroups.map(group => group === existingGroup ? { ...group, numbers: uniqueSorted([...group.numbers, number]) } : group)
    : [...state.vehicleGroups, { cc: `${cc}cc`, label: `${cc} ซีซี`, numbers: [number] }];
  return { vehicleGroups, responsibilityGroups: clone(state.responsibilityGroups) };
}

export function addResponsibilityGroupToState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  group: ResponsibilityGroupRecord,
): VehicleStateDraft {
  return {
    vehicleGroups: clone(state.vehicleGroups),
    responsibilityGroups: [...state.responsibilityGroups, normalizeResponsibilityGroup(group)],
  };
}

export function updateResponsibilityGroupInState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  groupId: string | number,
  patch: Partial<ResponsibilityGroupRecord>,
): VehicleStateDraft {
  return {
    vehicleGroups: clone(state.vehicleGroups),
    responsibilityGroups: state.responsibilityGroups.map(group =>
      String(group.id) === String(groupId) ? normalizeResponsibilityGroup({ ...group, ...patch }) : group
    ),
  };
}

export function removeResponsibilityGroupFromState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  groupId: string | number,
): VehicleStateDraft {
  return {
    vehicleGroups: clone(state.vehicleGroups),
    responsibilityGroups: state.responsibilityGroups.filter(group => String(group.id) !== String(groupId)),
  };
}

export function updateVehicleInResponsibilityState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  oldNumber: number,
  nextNumber: number,
  nextCc: VehicleCc,
): VehicleStateDraft {
  const vehicleGroups = state.vehicleGroups.map(group => {
    const containsOld = group.numbers.includes(oldNumber);
    const numbers = group.numbers.filter(number => number !== oldNumber);
    if (containsOld && normalizeVehicleCc(group.cc) === nextCc) numbers.push(nextNumber);
    return containsOld && normalizeVehicleCc(group.cc) !== nextCc
      ? { ...group, numbers: numbers.sort((a, b) => a - b) }
      : { ...group, numbers: numbers.sort((a, b) => a - b) };
  }).filter(group => group.numbers.length > 0);
  const targetGroup = vehicleGroups.find(group => normalizeVehicleCc(group.cc) === nextCc);
  if (!targetGroup) vehicleGroups.push({ cc: `${nextCc}cc`, label: `${nextCc} ซีซี`, numbers: [nextNumber] });
  else if (!targetGroup.numbers.includes(nextNumber)) targetGroup.numbers = uniqueSorted([...targetGroup.numbers, nextNumber]);
  const responsibilityGroups = state.responsibilityGroups.map(group => ({
    ...group,
    vehicleNumbers: group.vehicleNumbers.map(number => number === oldNumber ? nextNumber : number),
  }));
  return { vehicleGroups, responsibilityGroups };
}

export function removeVehicleFromResponsibilityState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  number: number,
): VehicleStateDraft {
  const vehicleGroups = state.vehicleGroups.map(group => ({
    ...group,
    numbers: group.numbers.filter(n => n !== number),
    unavailable: (group.unavailable ?? []).filter(n => n !== number),
    notifications: (group.notifications ?? []).filter(n => n !== number),
    inUse: (group.inUse ?? []).filter(n => n !== number),
    pickup: (group.pickup ?? []).filter(n => n !== number),
  }));
  const responsibilityGroups = state.responsibilityGroups.map(group => ({
    ...group,
    vehicleNumbers: group.vehicleNumbers.filter(n => n !== number),
  }));
  return { vehicleGroups, responsibilityGroups };
}

export function getUnassignedVehicleNumbers(vehicleGroups: VehicleGroupRecord[], responsibilityGroups: ResponsibilityGroupRecord[]): number[] {
  const assigned = new Set(responsibilityGroups.flatMap(group => group.vehicleNumbers));
  return Array.from(new Set(vehicleGroups.flatMap(group => group.numbers))).filter(number => !assigned.has(number)).sort((a, b) => a - b);
}

export function getVehicleResponsibility(number: number, responsibilityGroups: ResponsibilityGroupRecord[]): ResponsibilityGroupRecord | undefined {
  return responsibilityGroups.find(group => group.vehicleNumbers.includes(number));
}

export function getResponsibilityGroupColor(number: number, responsibilityGroups: ResponsibilityGroupRecord[], fallback = "#81e597") {
  return getVehicleResponsibility(number, responsibilityGroups)?.color || fallback;
}

export function getVehicleManagerIds(number: number, responsibilityGroups: ResponsibilityGroupRecord[]): number[] {
  const group = getVehicleResponsibility(number, responsibilityGroups);
  return group ? Array.from(new Set(group.managers)).slice(0, 2) : [];
}

export function removeManagerFromResponsibilityState(
  state: VehicleResponsibilityState | VehicleStateDraft,
  managerId: number,
): VehicleStateDraft {
  return {
    vehicleGroups: clone(state.vehicleGroups),
    responsibilityGroups: state.responsibilityGroups.map(group => ({ ...group, managers: group.managers.filter(id => id !== managerId) })),
  };
}

export function isVehicleUnassigned(number: number, responsibilityGroups: ResponsibilityGroupRecord[]): boolean {
  return getVehicleManagerIds(number, responsibilityGroups).length === 0;
}
