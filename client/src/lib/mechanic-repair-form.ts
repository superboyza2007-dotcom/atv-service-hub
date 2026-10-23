export type MechanicRepairFormValues = {
  vehicleNumber: string;
  decision: string;
};

export function canSubmitMechanicRepair(values: MechanicRepairFormValues): boolean {
  return Number(values.vehicleNumber) > 0 && values.decision.trim().length > 0;
}

export function normalizeOptionalRepairParts(value: string): string {
  return value.trim();
}
