import type { VehicleUsageHours } from "@/lib/vehicle-usage-hours";

export const ROUND_CHANGE_UPDATED_EVENT = "atv-mechanic-round-change-updated";
export const VEHICLE_CC_OPTIONS = ["200", "250"] as const;
export type VehicleCc = (typeof VEHICLE_CC_OPTIONS)[number];

export type MaintenanceRule = {
  id: string;
  name: string;
  enabled: boolean;
  thresholdHours: Record<VehicleCc, number>;
};

export type RoundChangeSettings = {
  rules: MaintenanceRule[];
};

export type MaintenanceAlert = {
  ruleId: string;
  ruleName: string;
  vehicleNumber: string;
  cc: VehicleCc;
  accumulatedHours: number;
  thresholdHours: number;
  remainingHours: number;
  due: boolean;
};

export const defaultRoundChangeSettings: RoundChangeSettings = {
  rules: [{ id: "engine-oil", name: "น้ำมันเครื่อง", enabled: true, thresholdHours: { 200: 0, 250: 0 } }],
};

export function normalizeThreshold(value: string | number | undefined) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.round(number * 10) / 10 : 0;
}

export function normalizeRoundChangeSettings(value: unknown): RoundChangeSettings {
  if (!value || typeof value !== "object") return defaultRoundChangeSettings;
  const candidate = value as { rules?: unknown };
  if (!Array.isArray(candidate.rules)) return defaultRoundChangeSettings;
  const rules = candidate.rules.flatMap((rule, index): MaintenanceRule[] => {
    if (!rule || typeof rule !== "object") return [];
    const source = rule as Partial<MaintenanceRule>;
    const name = typeof source.name === "string" ? source.name.trim() : "";
    if (!name) return [];
    const threshold = source.thresholdHours as Partial<Record<VehicleCc, string | number>> | undefined;
    return [{
      id: typeof source.id === "string" && source.id ? source.id : `maintenance-${index + 1}`,
      name,
      enabled: source.enabled !== false,
      thresholdHours: {
        200: normalizeThreshold(threshold?.[200]),
        250: normalizeThreshold(threshold?.[250]),
      },
    }];
  });
  return { rules };
}

export function addMaintenanceRule(settings: RoundChangeSettings, name: string, thresholds?: Partial<Record<VehicleCc, string | number>>): RoundChangeSettings {
  const trimmedName = name.trim();
  if (!trimmedName || settings.rules.some(rule => rule.name === trimmedName)) return settings;
  return {
    rules: [...settings.rules, {
      id: `maintenance-${Date.now().toString(36)}`,
      name: trimmedName,
      enabled: true,
      thresholdHours: {
        200: normalizeThreshold(thresholds?.["200"]),
        250: normalizeThreshold(thresholds?.["250"]),
      },
    }],
  };
}

export function updateMaintenanceRule(settings: RoundChangeSettings, ruleId: string, patch: Partial<Pick<MaintenanceRule, "name" | "enabled">> & { cc?: VehicleCc; thresholdHours?: string | number }): RoundChangeSettings {
  return {
    rules: settings.rules.map(rule => {
      if (rule.id !== ruleId) return rule;
      const nextThreshold = patch.cc ? { ...rule.thresholdHours, [patch.cc]: normalizeThreshold(patch.thresholdHours) } : rule.thresholdHours;
      return {
        ...rule,
        ...(patch.name === undefined ? {} : { name: patch.name.trim() }),
        ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
        thresholdHours: nextThreshold,
      };
    }),
  };
}

export function removeMaintenanceRule(settings: RoundChangeSettings, ruleId: string): RoundChangeSettings {
  return { rules: settings.rules.filter(rule => rule.id !== ruleId) };
}

export function getMaintenanceMeterLevel(progress: number) {
  const boundedProgress = Math.max(0, Math.min(100, progress));
  if (boundedProgress >= 100) return "critical" as const;
  if (boundedProgress >= 90) return "high-warning" as const;
  if (boundedProgress >= 70) return "warning" as const;
  return "safe" as const;
}

export function evaluateMaintenanceAlerts(settings: RoundChangeSettings, usage: VehicleUsageHours[]): MaintenanceAlert[] {
  return settings.rules.flatMap(rule => {
    if (!rule.enabled) return [];
    return usage.flatMap(vehicle => {
      const thresholdHours = rule.thresholdHours[vehicle.cc];
      if (!thresholdHours) return [];
      const remainingHours = Math.round((thresholdHours - vehicle.accumulatedHours) * 10) / 10;
      return [{
        ruleId: rule.id,
        ruleName: rule.name,
        vehicleNumber: vehicle.number,
        cc: vehicle.cc,
        accumulatedHours: vehicle.accumulatedHours,
        thresholdHours,
        remainingHours,
        due: remainingHours <= 0,
      }];
    });
  });
}
