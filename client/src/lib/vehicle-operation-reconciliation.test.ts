import { describe, expect, it } from "vitest";
import { deriveOperationalStatusOverrides } from "./vehicle-operation-reconciliation";

describe("operational vehicle status reconciliation", () => {
  it("restores unresolved repair and pending pickup states from shared queues", () => {
    const overrides = deriveOperationalStatusOverrides(
      [
        { vehicleId: "m3-v12", status: "แจ้งซ่อม" },
        { vehicleId: "m3-v17", status: "ซ่อมเสร็จ" },
      ],
      [{ vehicleNumber: 24, status: "กำลังซ่อม" }],
      [{ vehicleNumber: 12, status: "รอรับรถ" }],
    );

    expect(Array.from(overrides.entries())).toEqual([
      [24, "repair"],
      [12, "pickup"],
    ]);
    expect(overrides.has(17)).toBe(false);
  });

  it("does not create an operational override from safety notices or received pickup requests", () => {
    const overrides = deriveOperationalStatusOverrides(
      [],
      [],
      [{ vehicleNumber: 12, status: "รับรถแล้ว" }],
    );
    expect(overrides.size).toBe(0);
  });
});
