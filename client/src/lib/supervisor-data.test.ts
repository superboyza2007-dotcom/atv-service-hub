import { describe, expect, it } from "vitest";
import { buildSupervisorDatabaseStatusSummary, buildSupervisorInputVehicles, buildSupervisorUserDirectoryStatusModel, countGuidanceVehicles, getSupervisorVehicleStatus, pickupRequestsInResponsibilityGroups, resolveSupervisorOperationalStatus, summarizeSupervisorDatabaseStatus, summarizeSupervisorStatuses, supervisorStatusLabel, vehicleNumbersFromMechanicWarningTab } from "./supervisor-data";

describe("supervisor data", () => {
  it("resolves the shared vehicle status in operational priority order and ignores guidance notifications", () => {
    expect(getSupervisorVehicleStatus({ cc: "200cc", label: "200 ซีซี", numbers: [12], unavailable: [12], notifications: [12], pickup: [12], inUse: [12] }, 12)).toBe("active");
    expect(getSupervisorVehicleStatus({ cc: "200cc", label: "200 ซีซี", numbers: [12], unavailable: [12], notifications: [12], pickup: [12] }, 12)).toBe("pickup");
    expect(getSupervisorVehicleStatus({ cc: "200cc", label: "200 ซีซี", numbers: [12], unavailable: [], notifications: [12] }, 12)).toBe("ready");
    expect(getSupervisorVehicleStatus({ cc: "200cc", label: "200 ซีซี", numbers: [12], unavailable: [12] }, 12)).toBe("repair");
  });

  it("counts unique guidance vehicles that exist in the database", () => {
    expect(countGuidanceVehicles([12, 17], [{ vehicleNumber: 12 }, { vehicleNumber: 12 }, { vehicleNumber: 99 }])).toBe(1);
  });

  it("takes unique positive vehicle numbers from the Mechanic warning tab column", () => {
    expect(vehicleNumbersFromMechanicWarningTab([{ vehicleNumber: 12 }, { vehicleNumber: 12 }, { vehicleNumber: 17 }, { vehicleNumber: 0 }, { vehicleNumber: -1 }])).toEqual([12, 17]);
  });

  it("counts pickup only when the vehicle belongs to a responsibility group", () => {
    expect(pickupRequestsInResponsibilityGroups(
      [{ vehicleNumber: 12, status: "รอรับรถ" }, { vehicleNumber: 99, status: "รอรับรถ" }],
      [{ vehicleNumbers: [12, 17] }],
    )).toEqual([{ vehicleNumber: 12, status: "รอรับรถ" }]);
  });

  it("summarizes database sources once and subtracts unavailable vehicles from ready", () => {
    expect(summarizeSupervisorDatabaseStatus(
      [12, 17, 24, 25],
      [12, 12, 24],
      [12, 17, 17],
      [24, 24],
      [25, 25],
    )).toEqual({ total: 4, ready: 1, repair: 1, inspection: 2, pickup: 1, active: 1 });
  });

  it("ignores out-of-database numbers and gives active priority over pickup and repair", () => {
    expect(summarizeSupervisorDatabaseStatus([12, 17], [12, 99], [99, 17], [12, 12], [12])).toEqual({
      total: 2,
      ready: 1,
      repair: 0,
      inspection: 1,
      pickup: 0,
      active: 1,
    });
  });

  it("builds the User Directory summary from current database sources and ignores stale image values", () => {
    expect(buildSupervisorDatabaseStatusSummary({
      vehicleNumbers: [12, 17, 24, 38],
      guideReports: [
        { id: "r-12", vehicleId: "m3-v12", description: "เบรก", reporter: "ไกด์", createdAt: "2026-08-28T01:00:00.000Z", status: "แจ้งซ่อม" },
        { id: "r-24", vehicleId: "m3-v24", description: "โซ่", reporter: "ไกด์", createdAt: "2026-08-28T01:00:00.000Z", status: "แจ้งซ่อม" },
      ],
      mechanicRepairs: [{ sourceGuideRepairId: "r-24", vehicleNumber: 24, createdAt: "2026-08-28T02:00:00.000Z" }],
      guidanceVehicleNumbers: [38, 38],
      pickupVehicleNumbers: [17],
      activeVehicleNumbers: [12],
    })).toEqual({ total: 4, ready: 2, repair: 0, inspection: 1, pickup: 1, active: 1 });
  });

  it("exposes one status model for the Guide card and every inner drill-down metric", () => {
    const model = buildSupervisorUserDirectoryStatusModel({
      vehicleNumbers: [12, 17, 24, 38],
      vehicleCcByNumber: { 12: "200", 17: "200", 24: "250", 38: "250" },
      guideReports: [{ id: "r-24", vehicleId: "m3-v24", description: "เบรก", reporter: "ไกด์", createdAt: "2026-08-28T01:00:00.000Z", status: "แจ้งซ่อม" }],
      mechanicRepairs: [],
      guidanceVehicleNumbers: [12, 12, 99],
      pickupVehicleNumbers: [17, 17],
      activeVehicleNumbers: [38, 38],
    });
    expect(model.summary).toEqual({ total: 4, ready: 1, repair: 1, inspection: 1, pickup: 1, active: 1 });
    expect(model.byCc["200"].summary).toEqual({ total: 2, ready: 1, repair: 0, inspection: 1, pickup: 1, active: 0 });
    expect(model.byCc["250"].summary).toEqual({ total: 2, ready: 0, repair: 1, inspection: 0, pickup: 0, active: 1 });
    expect([...model.numbers.repair]).toEqual([24]);
    expect([...model.numbers.pickup]).toEqual([17]);
    expect([...model.numbers.active]).toEqual([38]);
    expect([...model.numbers.inspection]).toEqual([12]);
    expect([...model.numbers.ready]).toEqual([12]);
    expect(resolveSupervisorOperationalStatus(24, model.numbers)).toBe("repair");
    expect(resolveSupervisorOperationalStatus(12, model.numbers)).toBe("ready");
    expect(model.summary.inspection).toBe(model.byCc["200"].summary.inspection);
    expect(model.summary.pickup).toBe(model.byCc["200"].summary.pickup);
  });

  it("builds 2.1 vehicles from the canonical status model and keeps guidance selectable", () => {
    const model = buildSupervisorUserDirectoryStatusModel({
      vehicleNumbers: [12, 17, 24, 38],
      vehicleCcByNumber: { 12: "200", 17: "200", 24: "250", 38: "250" },
      guideReports: [{ id: "r-12", vehicleId: "m3-v12", description: "เบรก", reporter: "ไกด์", createdAt: "2026-08-28T01:00:00.000Z", status: "แจ้งซ่อม" }],
      mechanicRepairs: [],
      guidanceVehicleNumbers: [24],
      pickupVehicleNumbers: [17],
      activeVehicleNumbers: [38],
    });
    expect(buildSupervisorInputVehicles(model)).toEqual([
      { number: 12, cc: "200", status: "repair" },
      { number: 17, cc: "200", status: "pickup" },
      { number: 24, cc: "250", status: "inspection" },
      { number: 38, cc: "250", status: "active" },
    ]);
  });

  it("summarizes statuses and labels them in Thai", () => {
    expect(summarizeSupervisorStatuses(["ready", "repair", "repair", "active"])).toEqual({ total: 4, ready: 1, repair: 2, inspection: 0, pickup: 0, active: 1 });
    expect(supervisorStatusLabel("inspection")).toBe("คำแนะนำ");
    expect(supervisorStatusLabel("pickup")).toBe("แจ้งรับรถ");
  });
});
