import { describe, expect, it } from "vitest";
import { findSessionConflict, findSessionForMember, isOpenSession, sessionMemberKeys, sessionVehicleKeys } from "./session-conflicts";

const members = [
  { id: "7", name: "บอย" },
  { id: "8", name: "ตี่" },
];

const active = {
  sessionId: "M3-ACTIVE",
  status: "Active",
  memberIds: ["7", "8"],
  activeUserName: "บอย · ตี่",
  vehicleIds: ["m3-v61", "m3-v62"],
};

describe("session conflicts", () => {
  it("treats a member name as occupied even when the incoming ID format differs", () => {
    const conflict = findSessionForMember([active], "legacy-7", "บอย", members);
    expect(conflict?.sessionId).toBe("M3-ACTIVE");
  });

  it("blocks a new session when a selected vehicle is already in Active", () => {
    const conflict = findSessionConflict([active], { memberIds: ["99"], vehicleIds: ["61"] }, members);
    expect(conflict).toMatchObject({ reason: "vehicle", session: { sessionId: "M3-ACTIVE" } });
  });

  it("does not treat Completed sessions as occupied", () => {
    expect(isOpenSession({ ...active, status: "Completed" })).toBe(false);
    expect(findSessionConflict([{ ...active, status: "Completed" }], { memberIds: ["7"], vehicleIds: ["61"] }, members)).toBeUndefined();
  });

  it("ignores the same session while editing it", () => {
    expect(findSessionConflict([active], { memberIds: ["7"], vehicleIds: ["61"] }, members, "M3-ACTIVE")).toBeUndefined();
  });

  it("normalizes legacy session identifiers into stable collision keys", () => {
    expect(sessionVehicleKeys({ vehicleIds: ["m3-v61", "vehicle-62", "63"] })).toEqual(new Set(["vehicle:61", "vehicle:62", "vehicle:63"]));
    expect(sessionMemberKeys(active, members)).toEqual(new Set(["id:7", "name:บอย", "id:8", "name:ตี่"]));
  });
});
