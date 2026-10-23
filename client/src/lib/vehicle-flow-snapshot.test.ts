import { describe, expect, it } from "vitest";
import { mergeVehiclePickupRequests, mergeVehicleSafetyNotices } from "./vehicle-flow-snapshot";

const request = (overrides: Partial<{
  id: string;
  sourceRepairId: string;
  vehicleNumber: number;
  createdAt: string;
  status: "รอรับรถ" | "รับรถแล้ว";
  receivedAt?: string;
}> = {}) => ({
  id: "PU-RP-1",
  sourceRepairId: "RP-1",
  vehicleNumber: 12,
  cc: "200",
  message: "รถ #12 รอรับรถ",
  mechanic: "ช่าง A",
  recipients: [],
  createdAt: "2026-08-28T01:00:00.000Z",
  status: "รอรับรถ" as const,
  ...overrides,
});

describe("vehicle flow snapshot", () => {
  it("uses the Mechanic pickup list as the Supervisor source", () => {
    expect(mergeVehiclePickupRequests([], [request()])).toEqual([request()]);
  });

  it("keeps the latest received state over a stale pending copy", () => {
    const received = request({ status: "รับรถแล้ว", receivedAt: "2026-08-28T02:00:00.000Z" });
    const stalePending = request({ status: "รอรับรถ" });
    expect(mergeVehiclePickupRequests([received], [stalePending])).toEqual([received]);
  });

  it("replaces a pending request with the newer received state", () => {
    const pending = request();
    const received = request({ status: "รับรถแล้ว", receivedAt: "2026-08-28T02:00:00.000Z" });
    expect(mergeVehiclePickupRequests([pending], [received])).toEqual([received]);
  });

  it("preserves Mechanic warning-tab notices as the guidance source", () => {
    const notice = { id: "AL-1", vehicleNumber: 12, description: "ตรวจลมยางก่อนใช้งาน", severity: "ปกติ" as const, reporter: "ช่าง A", createdAt: "2026-08-28T01:00:00.000Z", updatedAt: "2026-08-28T01:00:00.000Z" };
    expect(mergeVehicleSafetyNotices([], [notice])).toEqual([notice]);
  });
});
