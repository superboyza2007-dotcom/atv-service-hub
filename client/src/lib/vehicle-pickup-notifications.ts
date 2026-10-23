export type PickupRecipient = {
  id: number;
  name: string;
};

export type PickupResponsibilityGroup = {
  id?: string | number;
  name?: string;
  managers: number[];
  vehicleNumbers: number[];
};
export type PickupDirectoryUser = { id: number; name: string };

export type VehiclePickupRequest = {
  id: string;
  sourceRepairId: string;
  vehicleNumber: number;
  cc: string;
  message: string;
  mechanic: string;
  recipients: PickupRecipient[];
  /** Canonical fleet group that owns this request. */
  responsibilityGroupId?: string;
  responsibilityGroupName?: string;
  /** All guides allowed to receive this vehicle in the owning group. */
  eligibleGuideIds?: number[];
  createdAt: string;
  status: "รอรับรถ" | "รับรถแล้ว";
  receivedAt?: string;
  receivedBy?: string;
};

export function normalizeVehiclePickupRequests(value: unknown): VehiclePickupRequest[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const request = item as Partial<VehiclePickupRequest>;
    if (
      typeof request.id !== "string"
      || typeof request.sourceRepairId !== "string"
      || !Number.isFinite(request.vehicleNumber)
      || typeof request.cc !== "string"
      || typeof request.message !== "string"
      || typeof request.mechanic !== "string"
      || typeof request.createdAt !== "string"
      || (request.status !== "รอรับรถ" && request.status !== "รับรถแล้ว")
      || !Array.isArray(request.recipients)
      || !request.recipients.every(recipient => Boolean(recipient) && typeof recipient === "object" && Number.isFinite((recipient as PickupRecipient).id) && typeof (recipient as PickupRecipient).name === "string")
    ) return [];
    const responsibilityGroupId = request.responsibilityGroupId === undefined || request.responsibilityGroupId === null
      ? undefined
      : String(request.responsibilityGroupId);
    const eligibleGuideIds = Array.isArray(request.eligibleGuideIds)
      ? Array.from(new Set(request.eligibleGuideIds.map(Number).filter(number => Number.isInteger(number) && number > 0)))
      : undefined;
    return [{
      ...request,
      vehicleNumber: Number(request.vehicleNumber),
      responsibilityGroupId,
      eligibleGuideIds,
      recipients: request.recipients.map(recipient => ({ id: Number(recipient.id), name: recipient.name })),
    } as VehiclePickupRequest];
  });
}

export function normalizePickupResponsibilityGroups(value: unknown): PickupResponsibilityGroup[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const group = item as Partial<PickupResponsibilityGroup>;
    const vehicleNumbers = Array.isArray(group.vehicleNumbers) ? group.vehicleNumbers.map(Number).filter(number => Number.isInteger(number) && number > 0) : [];
    const managers = Array.isArray(group.managers) ? group.managers.map(Number).filter(number => Number.isInteger(number) && number > 0) : [];
    if (!vehicleNumbers.length || !managers.length) return [];
    return [{ id: group.id === undefined ? undefined : String(group.id), name: typeof group.name === "string" ? group.name : undefined, vehicleNumbers: Array.from(new Set(vehicleNumbers)), managers: Array.from(new Set(managers)).slice(0, 2) }];
  });
}

export function responsibilityGroupForVehicle(
  vehicleNumber: number,
  groups: PickupResponsibilityGroup[],
): PickupResponsibilityGroup | undefined {
  return groups.find(group => group.vehicleNumbers.includes(vehicleNumber));
}

export function recipientsForVehicleGroup(
  vehicleNumber: number,
  groups: PickupResponsibilityGroup[],
  users: PickupDirectoryUser[],
): PickupRecipient[] {
  const group = responsibilityGroupForVehicle(vehicleNumber, groups);
  const userById = new Map(users.map(user => [user.id, user]));
  return Array.from(new Set((group?.managers ?? []).slice(0, 2)))
    .map(id => userById.get(id))
    .filter((user): user is PickupDirectoryUser => Boolean(user))
    .map(user => ({ id: user.id, name: user.name }));
}

/** Adds the owning group and the complete shared permission set to a request. */
export function decorateVehiclePickupRequest(
  request: VehiclePickupRequest,
  groups: PickupResponsibilityGroup[],
  users: PickupDirectoryUser[],
): VehiclePickupRequest {
  const group = responsibilityGroupForVehicle(request.vehicleNumber, groups);
  if (!group) return request;
  const eligibleGuideIds = Array.from(new Set(group.managers)).slice(0, 2);
  return {
    ...request,
    responsibilityGroupId: group.id === undefined ? request.responsibilityGroupId : String(group.id),
    responsibilityGroupName: group.name ?? request.responsibilityGroupName,
    eligibleGuideIds,
    recipients: recipientsForVehicleGroup(request.vehicleNumber, groups, users),
  };
}

function requestTimestamp(request: VehiclePickupRequest) {
  const parsed = Date.parse(request.receivedAt ?? request.createdAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Supervisor Database's group-routed pickup aggregator. It merges by repair
 * identity, preserves unrelated groups, and never lets a stale pending record
 * replace a newer received record.
 */
export function aggregateVehiclePickupRequests(
  current: VehiclePickupRequest[],
  incoming: VehiclePickupRequest[],
  groups: PickupResponsibilityGroup[] = [],
  users: PickupDirectoryUser[] = [],
): VehiclePickupRequest[] {
  const byRequest = new Map<string, VehiclePickupRequest>();
  [...current, ...incoming].forEach(rawRequest => {
    const request = decorateVehiclePickupRequest(rawRequest, groups, users);
    const key = request.sourceRepairId || request.id;
    const previous = byRequest.get(key);
    if (!previous || requestTimestamp(request) >= requestTimestamp(previous)) byRequest.set(key, request);
  });
  return Array.from(byRequest.values()).sort((left, right) => requestTimestamp(right) - requestTimestamp(left));
}

export function upsertVehiclePickupRequest(requests: VehiclePickupRequest[], nextRequest: VehiclePickupRequest): VehiclePickupRequest[] {
  const index = requests.findIndex(request => request.sourceRepairId === nextRequest.sourceRepairId);
  if (index < 0) return [nextRequest, ...requests];
  return requests.map((request, requestIndex) => requestIndex === index ? nextRequest : request);
}

export function removeVehiclePickupRequest(requests: VehiclePickupRequest[], sourceRepairId: string): VehiclePickupRequest[] {
  return requests.filter(request => request.sourceRepairId !== sourceRepairId);
}

export function pendingVehiclePickupRequests(requests: VehiclePickupRequest[]): VehiclePickupRequest[] {
  return requests.filter(request => request.status === "รอรับรถ");
}

export function reconcilePickupRecipients(
  requests: VehiclePickupRequest[],
  groups: PickupResponsibilityGroup[],
  users: PickupDirectoryUser[],
): VehiclePickupRequest[] {
  return requests.map(request => decorateVehiclePickupRequest(request, groups, users));
}

/** Only a manager assigned to the vehicle's responsibility group may receive it. */
export function canReceiveVehiclePickup(
  vehicleNumber: number,
  actorId: number | undefined,
  groups: PickupResponsibilityGroup[],
): boolean {
  if (!Number.isFinite(actorId)) return false;
  return Boolean(responsibilityGroupForVehicle(vehicleNumber, groups)?.managers.includes(actorId as number));
}

export function pickupRequestsForResponsibleOwner(
  requests: VehiclePickupRequest[],
  actorId: number | undefined,
  groups: PickupResponsibilityGroup[],
): VehiclePickupRequest[] {
  if (!Number.isFinite(actorId)) return [];
  return requests.filter(request => request.eligibleGuideIds?.length
    ? request.eligibleGuideIds.includes(actorId as number)
    : canReceiveVehiclePickup(request.vehicleNumber, actorId, groups));
}

export function markVehiclePickupRequestReceived(requests: VehiclePickupRequest[], requestId: string, receivedBy: string, receivedAt: string): VehiclePickupRequest[] {
  return requests.map(request => request.id === requestId ? { ...request, status: "รับรถแล้ว", receivedBy, receivedAt } : request);
}

export type ReceivePickupResult = {
  requests: VehiclePickupRequest[];
  updated: boolean;
  reason?: "not_found" | "already_received" | "not_authorized";
};

/**
 * Group-scoped receive operation. Two eligible guides may press the button,
 * but only the first operation can transition the central record.
 */
export function receiveVehiclePickupForGuide(
  requests: VehiclePickupRequest[],
  requestId: string,
  actorId: number | undefined,
  receivedBy: string,
  receivedAt: string,
  groups: PickupResponsibilityGroup[] = [],
): ReceivePickupResult {
  const target = requests.find(request => request.id === requestId);
  if (!target) return { requests, updated: false, reason: "not_found" };
  if (target.status !== "รอรับรถ") return { requests, updated: false, reason: "already_received" };
  const eligibleGuideIds = target.eligibleGuideIds?.length
    ? target.eligibleGuideIds
    : responsibilityGroupForVehicle(target.vehicleNumber, groups)?.managers ?? [];
  if (!Number.isInteger(actorId) || !eligibleGuideIds.includes(actorId as number)) {
    return { requests, updated: false, reason: "not_authorized" };
  }
  return {
    requests: markVehiclePickupRequestReceived(requests, requestId, receivedBy, receivedAt),
    updated: true,
  };
}
