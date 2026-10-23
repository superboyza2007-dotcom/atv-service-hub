import { describe, expect, it } from "vitest";
import { assertVehicleTransition, VehicleFlowRuleError } from "./vehicleFlowRules";

describe("Vehicle Flow rules", () => {
  it("permits a responsible guide to report a ready vehicle for repair", () => {
    expect(() => assertVehicleTransition({
      from: "ready",
      to: "repair",
      eventType: "guide_reported_repair",
      appRole: "guide",
      membershipRole: "guide",
    })).not.toThrow();
  });

  it("permits a responsible mechanic to move a repaired vehicle to pickup", () => {
    expect(() => assertVehicleTransition({
      from: "repair",
      to: "pickup",
      eventType: "mechanic_marked_pickup",
      appRole: "mechanic",
      membershipRole: "mechanic",
    })).not.toThrow();
  });

  it("permits only a responsible guide to receive a pickup vehicle", () => {
    expect(() => assertVehicleTransition({
      from: "pickup",
      to: "ready",
      eventType: "guide_received_vehicle",
      appRole: "guide",
      membershipRole: "guide",
    })).not.toThrow();
  });

  it("rejects a user outside the vehicle group from receiving it", () => {
    expect(() => assertVehicleTransition({
      from: "pickup",
      to: "ready",
      eventType: "guide_received_vehicle",
      appRole: "supervisor",
      membershipRole: null,
    })).toThrow(VehicleFlowRuleError);
  });

  it("permits automatic completion to return an active vehicle to ready", () => {
    expect(() => assertVehicleTransition({
      from: "active",
      to: "ready",
      eventType: "session_completed",
      appRole: "user",
      membershipRole: null,
    })).not.toThrow();
  });
});


  it("permits a session cancellation to return a reserved active vehicle to ready", () => {
    expect(() => assertVehicleTransition({
      from: "active",
      to: "ready",
      eventType: "session_cancelled",
      appRole: "guide",
      membershipRole: "guide",
    })).not.toThrow();
  });
