import { describe, expect, it } from "vitest";
import { buildVehicleHistory, reconcileVehicleHistory, sortVehicleHistory } from "./session-vehicle-history";

const vehicles = [
  { id: "m3-v12", number: "12", cc: "200" as const },
  { id: "m3-v25", number: "25", cc: "200" as const },
  { id: "m3-v54", number: "54", cc: "250" as const },
];

describe("session vehicle history", () => {
  it("starts with every vehicle selected for a new session", () => {
    expect(buildVehicleHistory(vehicles, ["m3-v12", "m3-v54"], "2026-08-26T09:00:00.000Z").map(item => item.number)).toEqual(["12", "54"]);
  });

  it("keeps a removed vehicle and marks the replacement as active", () => {
    const initial = { sessionId: "M3-1", createdAt: "2026-08-26T09:00:00.000Z", vehicleIds: ["m3-v12", "m3-v25"] };
    const history = reconcileVehicleHistory(initial, vehicles, ["m3-v12", "m3-v54"], "2026-08-26T09:10:00.000Z");
    expect(history.find(item => item.vehicleId === "m3-v25")?.removedAt).toBe("2026-08-26T09:10:00.000Z");
    expect(history.find(item => item.vehicleId === "m3-v54")?.removedAt).toBeUndefined();
    expect(sortVehicleHistory(history).map(item => `${item.cc}:${item.number}`)).toEqual(["200:12", "200:25", "250:54"]);
  });

  it("does not duplicate a vehicle when it is re-added", () => {
    const history = reconcileVehicleHistory({ vehicleIds: ["m3-v12"], vehicleHistory: [{ vehicleId: "m3-v12", number: "12", cc: "200", addedAt: "2026-08-26T09:00:00.000Z", removedAt: "2026-08-26T09:05:00.000Z" }] }, vehicles, ["m3-v12"], "2026-08-26T09:10:00.000Z");
    expect(history).toHaveLength(1);
    expect(history[0].removedAt).toBeUndefined();
  });
});
