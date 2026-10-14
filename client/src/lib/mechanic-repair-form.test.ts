import { describe, expect, it } from "vitest";
import { canSubmitMechanicRepair, normalizeOptionalRepairParts } from "./mechanic-repair-form";

describe("mechanic repair form", () => {
  it("allows submission without selecting a spare part", () => {
    expect(canSubmitMechanicRepair({ vehicleNumber: "17", decision: "ไม่แจ้งรับรถ" })).toBe(true);
  });

  it("still requires a vehicle and a repair decision", () => {
    expect(canSubmitMechanicRepair({ vehicleNumber: "", decision: "ไม่แจ้งรับรถ" })).toBe(false);
    expect(canSubmitMechanicRepair({ vehicleNumber: "17", decision: "" })).toBe(false);
  });

  it("normalizes the optional spare part field", () => {
    expect(normalizeOptionalRepairParts("  ผ้าเบรก  ")).toBe("ผ้าเบรก");
    expect(normalizeOptionalRepairParts(" ")).toBe("");
  });
});
