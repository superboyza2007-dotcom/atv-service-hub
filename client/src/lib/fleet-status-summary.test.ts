import { describe, expect, it } from "vitest";
import { summarizeFleetStatus } from "./fleet-status-summary";

describe("summarizeFleetStatus", () => {
  it("counts only vehicles in the requested fleet", () => {
    const vehicles = [
      { cc: "200" as const, status: "ready" as const },
      { cc: "200" as const, status: "active" as const },
      { cc: "200" as const, status: "inspection" as const },
      { cc: "250" as const, status: "repair" as const },
      { cc: "250" as const, status: "pickup" as const },
    ];

    expect(summarizeFleetStatus(vehicles, "200")).toEqual({ ready: 2, repair: 0, alert: 1, pickup: 0, active: 1, total: 3 });
    expect(summarizeFleetStatus(vehicles, "250")).toEqual({ ready: 0, repair: 1, alert: 0, pickup: 1, active: 0, total: 2 });
  });
});
