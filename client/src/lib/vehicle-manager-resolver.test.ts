import { describe, expect, it } from "vitest";
import { formatGroupManagerNames, formatVehicleManagerNames, resolveGroupManagerNames, resolveVehicleManagerNames, resolveVehicleResponsibilityView } from "./vehicle-manager-resolver";

const groups = [
  { id: "fleet-a", name: "ฝูงเหนือ", managers: [101, 102, 101], vehicleNumbers: [12, 17] },
  { id: "fleet-b", name: "ฝูงใต้", managers: [103], vehicleNumbers: [38] },
];

const directoryUsers = [
  { id: "101", name: "บอย" },
  { id: 102, name: "นก" },
  { id: 103, name: "บอย" },
];

describe("vehicle manager resolver", () => {
  it("resolves manager IDs through the shared directory and removes duplicate names", () => {
    expect(resolveVehicleManagerNames(12, groups, directoryUsers)).toEqual(["บอย", "นก"]);
    expect(resolveVehicleManagerNames(38, groups, directoryUsers)).toEqual(["บอย"]);
  });

  it("does not duplicate a legacy fallback when canonical names are unavailable", () => {
    expect(resolveVehicleManagerNames(12, groups, [{ id: 999, name: "ผู้ใช้งานอื่น" }], ["บอย", "บอย", " นก "])).toEqual(["บอย", "นก"]);
  });

  it("formats a consistent label and uses the empty label only when no source has a name", () => {
    expect(formatVehicleManagerNames(12, groups, directoryUsers)).toBe("บอย · นก");
    expect(formatVehicleManagerNames(99, groups, directoryUsers, [], "ยังไม่ได้กำหนด")).toBe("ยังไม่ได้กำหนด");
  });

  it("resolves group managers directly without depending on a vehicle number", () => {
    expect(resolveGroupManagerNames(groups[0], directoryUsers)).toEqual(["บอย", "นก"]);
    expect(formatGroupManagerNames(groups[0], directoryUsers)).toBe("บอย · นก");
    expect(formatGroupManagerNames({ ...groups[0], managers: [] }, directoryUsers, [], "ยังไม่มีผู้รับผิดชอบ")).toBe("ยังไม่มีผู้รับผิดชอบ");
  });

  it("returns one shared responsibility view for vehicle cards, selectors, and status rows", () => {
    expect(resolveVehicleResponsibilityView(12, groups, directoryUsers)).toMatchObject({
      groupLabel: "ฝูงเหนือ (fleet-a)",
      managerNames: ["บอย", "นก"],
      managerLabel: "บอย · นก",
      color: "#81e597",
    });
  });
});
