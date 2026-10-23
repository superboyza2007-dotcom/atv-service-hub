import { describe, expect, it } from "vitest";
import { activeVehicleId, availableReplacementVehicleNumbers } from "./active-vehicle-selection";

describe("active vehicle replacement selection", () => {
  it("normalizes numeric and legacy vehicle ids", () => {
    expect(activeVehicleId(12)).toBe("m3-v12");
    expect(activeVehicleId("m3-v12")).toBe("m3-v12");
  });

  it("matches Guide behavior by allowing stale active vehicles with no owning session", () => {
    const result = availableReplacementVehicleNumbers(
      [{ number: 12, status: "active" }, { number: 17, status: "ready" }, { number: 26, status: "repair" }],
      [{ sessionId: "M1", status: "Active", vehicleIds: ["m3-v12"] }],
      "M1",
    );
    expect(result).toEqual(new Set([12, 17]));
  });

  it("keeps a vehicle with a guidance label selectable when no main status blocks it", () => {
    const result = availableReplacementVehicleNumbers(
      [{ number: 12, status: "inspection" }, { number: 17, status: "pickup" }, { number: 26, status: "active" }],
      [],
    );
    expect(result).toEqual(new Set([12, 26]));
  });

  it("excludes vehicles owned by another active or standby session while leaving selected-session vehicles for caller filtering", () => {
    const result = availableReplacementVehicleNumbers(
      [{ number: 12, status: "ready" }, { number: 17, status: "ready" }, { number: 26, status: "ready" }],
      [
        { sessionId: "M1", status: "Active", vehicleIds: ["m3-v12"] },
        { sessionId: "M2", status: "Standby", vehicleIds: ["m3-v17"] },
      ],
      "M1",
    );
    expect(result).toEqual(new Set([12, 26]));
  });
});
