import { describe, expect, it } from "vitest";
import { accumulatedHoursForVehicle, summarizeVehicleUsageHours } from "@/lib/vehicle-usage-hours";

const vehicles = [
  { id: "v12", number: "12", cc: "200" as const },
  { id: "v17", number: "17", cc: "200" as const },
  { id: "v38", number: "38", cc: "250" as const },
];

describe("vehicle accumulated usage hours", () => {
  it("looks up the accumulated snapshot by vehicle number", () => {
    const rows = summarizeVehicleUsageHours([
      { sessionId: "lookup-1", status: "Completed", durationMinutes: 60, vehicleIds: ["v12"], completedAt: "2026-08-28T02:00:00.000Z" },
    ], vehicles);
    expect(accumulatedHoursForVehicle(rows, 12)).toBe(1);
    expect(accumulatedHoursForVehicle(rows, "99")).toBeUndefined();
  });

  it("counts a full 30-minute or 60-minute round for every vehicle used", () => {
    const result = summarizeVehicleUsageHours([
      { sessionId: "s1", status: "Completed", durationMinutes: 30, vehicleIds: ["v12", "v17"], createdAt: "2026-08-26T01:00:00.000Z", completedAt: "2026-08-26T01:30:00.000Z" },
      { sessionId: "s2", status: "Completed", durationMinutes: 60, vehicleIds: ["v12"], createdAt: "2026-08-26T02:00:00.000Z", completedAt: "2026-08-26T03:00:00.000Z" },
      { sessionId: "s3", status: "Active", durationMinutes: 60, vehicleIds: ["v38"], createdAt: "2026-08-26T04:00:00.000Z" },
    ], vehicles);

    expect(result.find(vehicle => vehicle.number === "12")).toMatchObject({ round30: 1, round60: 1, totalRounds: 2, accumulatedHours: 1.5 });
    expect(result.find(vehicle => vehicle.number === "17")).toMatchObject({ round30: 1, round60: 0, totalRounds: 1, accumulatedHours: 0.5 });
    expect(result.find(vehicle => vehicle.number === "38")).toMatchObject({ totalRounds: 0, accumulatedHours: 0 });
  });

  it("includes a vehicle removed or replaced before completion", () => {
    const result = summarizeVehicleUsageHours([
      {
        sessionId: "swap-1",
        status: "Completed",
        durationMinutes: 60,
        vehicleIds: ["v17"],
        vehicleHistory: [
          { vehicleId: "v12", number: "12", cc: "200", addedAt: "2026-08-26T01:00:00.000Z", removedAt: "2026-08-26T01:20:00.000Z" },
          { vehicleId: "v17", number: "17", cc: "200", addedAt: "2026-08-26T01:20:00.000Z" },
        ],
        createdAt: "2026-08-26T01:00:00.000Z",
        completedAt: "2026-08-26T02:00:00.000Z",
      },
    ], vehicles);

    expect(result.find(vehicle => vehicle.number === "12")).toMatchObject({ round60: 1, accumulatedHours: 1 });
    expect(result.find(vehicle => vehicle.number === "17")).toMatchObject({ round60: 1, accumulatedHours: 1 });
  });

  it("does not count the same session twice and returns every catalog vehicle", () => {
    const session = { sessionId: "same", status: "Completed", durationMinutes: 30, vehicleIds: ["v38"], createdAt: "2026-08-26T01:00:00.000Z", completedAt: "2026-08-26T01:30:00.000Z" };
    const result = summarizeVehicleUsageHours([session, session], vehicles);
    expect(result).toHaveLength(3);
    expect(result.find(vehicle => vehicle.number === "38")).toMatchObject({ totalRounds: 1, accumulatedHours: 0.5 });
  });
});
