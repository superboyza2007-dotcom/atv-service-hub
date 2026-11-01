import { describe, expect, it } from "vitest";
import { shouldClearVehicleStatusHistory } from "./vehicleStatusHistoryRetention";

const cleanReadyState = {
  vehicleStatus: "ready",
  hasOpenRepair: false,
  hasLiveSession: false,
  hasUnreadPickupNotification: false,
};

describe("vehicle status history retention", () => {
  it("clears a vehicle cycle when it is ready and has no related pending state", () => {
    expect(shouldClearVehicleStatusHistory(cleanReadyState)).toBe(true);
  });

  it.each([
    ["vehicle is still in a non-ready status", { ...cleanReadyState, vehicleStatus: "pickup" }],
    ["an open repair remains", { ...cleanReadyState, hasOpenRepair: true }],
    ["a standby or active session remains", { ...cleanReadyState, hasLiveSession: true }],
    ["a pickup notification is still unread", { ...cleanReadyState, hasUnreadPickupNotification: true }],
  ])("keeps history while %s", (_reason, state) => {
    expect(shouldClearVehicleStatusHistory(state)).toBe(false);
  });
});
