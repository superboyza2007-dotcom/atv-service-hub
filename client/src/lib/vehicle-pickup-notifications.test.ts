import { describe, expect, it } from "vitest";
import {
  aggregateVehiclePickupRequests,
  markVehiclePickupRequestReceived,
  normalizeVehiclePickupRequests,
  receiveVehiclePickupForGuide,
  pickupRequestsForResponsibleOwner,
  pendingVehiclePickupRequests,
  removeVehiclePickupRequest,
  upsertVehiclePickupRequest,
  type VehiclePickupRequest,
} from "./vehicle-pickup-notifications";

const request: VehiclePickupRequest = {
  id: "PU-RP-1",
  sourceRepairId: "RP-1",
  vehicleNumber: 38,
  cc: "250",
  message: "รถ #38 (250 Cc.) ซ่อมเสร็จแล้ว กรุณามารับรถ",
  mechanic: "ช่างหนึ่ง",
  recipients: [{ id: 7, name: "บอย" }],
  createdAt: "2026-08-26T06:55:00.000Z",
  status: "รอรับรถ",
};

describe("vehicle pickup notifications", () => {
  it("upserts a request by the source repair id instead of duplicating it", () => {
    const updated = upsertVehiclePickupRequest([request], { ...request, message: "ข้อความล่าสุด" });
    expect(updated).toHaveLength(1);
    expect(updated[0].message).toBe("ข้อความล่าสุด");
  });

  it("filters pending requests and marks a request as received", () => {
    const received = markVehiclePickupRequestReceived([request], request.id, "ไกด์บอย", "2026-08-26T07:00:00.000Z");
    expect(pendingVehiclePickupRequests(received)).toHaveLength(0);
    expect(received[0]).toMatchObject({ status: "รับรถแล้ว", receivedBy: "ไกด์บอย" });
  });

  it("removes the notification when a repair is no longer a pickup request", () => {
    expect(removeVehiclePickupRequest([request], request.sourceRepairId)).toEqual([]);
  });

  it("rejects malformed pickup payloads", () => {
    expect(normalizeVehiclePickupRequests([{ ...request, recipients: [{ id: "bad", name: "บอย" }] }])).toEqual([]);
  });

  it("allows only an assigned group owner to receive a vehicle", async () => {
    const { canReceiveVehiclePickup } = await import("./vehicle-pickup-notifications");
    const groups = [
      { vehicleNumbers: [12], managers: [1, 2] },
      { vehicleNumbers: [38], managers: [7, 8] },
    ];
    expect(canReceiveVehiclePickup(38, 7, groups)).toBe(true);
    expect(canReceiveVehiclePickup(38, 1, groups)).toBe(false);
    expect(canReceiveVehiclePickup(38, undefined, groups)).toBe(false);
    expect(canReceiveVehiclePickup(99, 7, groups)).toBe(false);
  });

  it("filters pickup requests to the current owner's vehicle groups", () => {
    const visible = pickupRequestsForResponsibleOwner([
      request,
      { ...request, id: "PU-RP-2", vehicleNumber: 12 },
      { ...request, id: "PU-RP-3", vehicleNumber: 99 },
    ], 7, [
      { vehicleNumbers: [12], managers: [1, 2] },
      { vehicleNumbers: [38], managers: [7, 8] },
    ]);
    expect(visible.map(item => item.vehicleNumber)).toEqual([38]);
  });

  it("aggregates requests by repair identity while preserving group ownership and both eligible guides", async () => {
    const grouped = aggregateVehiclePickupRequests([], [{ ...request, responsibilityGroupId: "group-250-1", responsibilityGroupName: "ฝูง 250 ชุด 1" }], [
      { id: "group-250-1", name: "ฝูง 250 ชุด 1", vehicleNumbers: [38], managers: [7, 8] },
      { id: "group-200", name: "ฝูง 200", vehicleNumbers: [12], managers: [1, 2] },
    ], [
      { id: 7, name: "ไกด์หนึ่ง" },
      { id: 8, name: "ไกด์สอง" },
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ responsibilityGroupId: "group-250-1", responsibilityGroupName: "ฝูง 250 ชุด 1", eligibleGuideIds: [7, 8] });
    expect(grouped[0].recipients).toEqual([{ id: 7, name: "ไกด์หนึ่ง" }, { id: 8, name: "ไกด์สอง" }]);
  });

  it("allows either eligible guide in the same group to receive, but only the first receive changes the central record", () => {
    const groups = [{ id: "group-250-1", vehicleNumbers: [38], managers: [7, 8] }];
    const central = aggregateVehiclePickupRequests([], [{ ...request, responsibilityGroupId: "group-250-1", eligibleGuideIds: [7, 8] }], groups);
    const first = receiveVehiclePickupForGuide(central, request.id, 8, "ไกด์สอง", "2026-08-26T07:00:00.000Z", groups);
    expect(first.updated).toBe(true);
    expect(first.requests[0]).toMatchObject({ status: "รับรถแล้ว", receivedBy: "ไกด์สอง" });
    const second = receiveVehiclePickupForGuide(first.requests, request.id, 7, "ไกด์หนึ่ง", "2026-08-26T07:01:00.000Z", groups);
    expect(second.updated).toBe(false);
    expect(second.reason).toBe("already_received");
    expect(second.requests[0].receivedBy).toBe("ไกด์สอง");
    const outside = receiveVehiclePickupForGuide(central, request.id, 1, "ไกด์ต่างกลุ่ม", "2026-08-26T07:02:00.000Z", groups);
    expect(outside.updated).toBe(false);
    expect(outside.reason).toBe("not_authorized");
  });

  it("resolves pickup recipients only from the vehicle's assigned group", async () => {
    const { recipientsForVehicleGroup } = await import("./vehicle-pickup-notifications");
    const recipients = recipientsForVehicleGroup(38, [
      { vehicleNumbers: [12], managers: [1, 2] },
      { vehicleNumbers: [38], managers: [7, 8, 9] },
    ], [
      { id: 1, name: "กลุ่มหนึ่ง" },
      { id: 2, name: "กลุ่มสอง" },
      { id: 7, name: "ผู้ดูแลรถ 38 คนที่หนึ่ง" },
      { id: 8, name: "ผู้ดูแลรถ 38 คนที่สอง" },
      { id: 9, name: "ต้องไม่ถูกส่ง" },
    ]);
    expect(recipients).toEqual([
      { id: 7, name: "ผู้ดูแลรถ 38 คนที่หนึ่ง" },
      { id: 8, name: "ผู้ดูแลรถ 38 คนที่สอง" },
    ]);
  });
});
