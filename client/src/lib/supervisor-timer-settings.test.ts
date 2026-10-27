import { describe, expect, it } from "vitest";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS, normalizeSupervisorTimerSettings } from "@shared/supervisor-timer-settings";

describe("supervisor timer settings", () => {
  it("provides safe defaults when there is no saved configuration", () => {
    expect(normalizeSupervisorTimerSettings(undefined)).toEqual(DEFAULT_SUPERVISOR_TIMER_SETTINGS);
  });

  it("accepts the supported duration and expiry policy values", () => {
    expect(normalizeSupervisorTimerSettings({ enabled: false, defaultDurationMinutes: 60, expiryBehavior: "auto_complete" })).toEqual({
      enabled: false,
      defaultDurationMinutes: 60,
      expiryBehavior: "auto_complete",
    });
  });

  it("falls back for invalid fields without discarding valid settings", () => {
    expect(normalizeSupervisorTimerSettings({ enabled: false, defaultDurationMinutes: 45, expiryBehavior: "invalid" })).toEqual({
      enabled: false,
      defaultDurationMinutes: 30,
      expiryBehavior: "overtime",
    });
  });
});
