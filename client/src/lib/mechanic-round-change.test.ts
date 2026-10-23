import { describe, expect, it } from "vitest";
import { addMaintenanceRule, defaultRoundChangeSettings, evaluateMaintenanceAlerts, getMaintenanceMeterLevel, normalizeRoundChangeSettings, removeMaintenanceRule, updateMaintenanceRule } from "@/lib/mechanic-round-change";

describe("mechanic round-change settings", () => {
  it("stores separate driving-hour thresholds for 200cc and 250cc", () => {
    const withRule = updateMaintenanceRule(defaultRoundChangeSettings, "engine-oil", { cc: "200", thresholdHours: "50" });
    const next = updateMaintenanceRule(withRule, "engine-oil", { cc: "250", thresholdHours: 75 });
    expect(next.rules[0]?.thresholdHours).toEqual({ 200: 50, 250: 75 });
  });

  it("marks only vehicles at or beyond their group threshold as due", () => {
    const settings = updateMaintenanceRule(
      updateMaintenanceRule(defaultRoundChangeSettings, "engine-oil", { cc: "200", thresholdHours: 50 }),
      "engine-oil",
      { cc: "250", thresholdHours: 75 },
    );
    const alerts = evaluateMaintenanceAlerts(settings, [
      { number: "12", cc: "200", round30: 0, round60: 0, totalRounds: 0, accumulatedHours: 50 },
      { number: "17", cc: "200", round30: 0, round60: 0, totalRounds: 0, accumulatedHours: 49.5 },
      { number: "38", cc: "250", round30: 0, round60: 0, totalRounds: 0, accumulatedHours: 80 },
    ]);
    expect(alerts.find(alert => alert.vehicleNumber === "12")?.due).toBe(true);
    expect(alerts.find(alert => alert.vehicleNumber === "17")?.due).toBe(false);
    expect(alerts.find(alert => alert.vehicleNumber === "38")).toMatchObject({ due: true, remainingHours: -5 });
  });

  it("rejects duplicate rule names and normalizes invalid settings safely", () => {
    expect(addMaintenanceRule(defaultRoundChangeSettings, "น้ำมันเครื่อง")).toBe(defaultRoundChangeSettings);
    expect(normalizeRoundChangeSettings({ rules: [{ name: "ผ้าเบรก", thresholdHours: { 200: -1, 250: "60" } }] })).toMatchObject({ rules: [{ name: "ผ้าเบรก", enabled: true, thresholdHours: { 200: 0, 250: 60 } }] });
    expect(normalizeRoundChangeSettings({ rules: "bad" })).toEqual(defaultRoundChangeSettings);
  });
});

  it("does not create alerts for a disabled maintenance rule", () => {
    const disabled = updateMaintenanceRule(defaultRoundChangeSettings, "engine-oil", { enabled: false });
    const alerts = evaluateMaintenanceAlerts(disabled, [{ number: "12", cc: "200", round30: 0, round60: 0, totalRounds: 0, accumulatedHours: 120 }]);
    expect(alerts).toEqual([]);
  });

  it("maps maintenance meter progress to the requested warning levels", () => {
    expect(getMaintenanceMeterLevel(1)).toBe("safe");
    expect(getMaintenanceMeterLevel(70)).toBe("warning");
    expect(getMaintenanceMeterLevel(89.9)).toBe("warning");
    expect(getMaintenanceMeterLevel(90)).toBe("high-warning");
    expect(getMaintenanceMeterLevel(99.9)).toBe("high-warning");
    expect(getMaintenanceMeterLevel(100)).toBe("critical");
    expect(getMaintenanceMeterLevel(140)).toBe("critical");
  });

  it("creates a new alert rule with both engine-group thresholds", () => {
    const next = addMaintenanceRule(defaultRoundChangeSettings, "ผ้าเบรก", { 200: "70", 250: 90 });
    expect(next.rules.at(-1)).toMatchObject({ name: "ผ้าเบรก", enabled: true, thresholdHours: { 200: 70, 250: 90 } });
  });

  it("removes only the selected alert rule", () => {
    const withBrake = addMaintenanceRule(defaultRoundChangeSettings, "ผ้าเบรก", { 200: 70, 250: 90 });
    const brakeId = withBrake.rules.at(-1)?.id;
    expect(brakeId).toBeTruthy();
    expect(removeMaintenanceRule(withBrake, brakeId ?? "").rules).toHaveLength(1);
    expect(removeMaintenanceRule(withBrake, brakeId ?? "").rules[0]?.name).toBe("น้ำมันเครื่อง");
  });
