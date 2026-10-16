import { describe, expect, it } from "vitest";
import { OPERATIONS_SNAPSHOT_KEYS, parseOperationsSnapshot, serializeOperationsSnapshot } from "./operations-snapshot";

describe("operations snapshot transport", () => {
  it("uses stable keys for shared fleet and guide session state", () => {
    expect(OPERATIONS_SNAPSHOT_KEYS).toEqual({ fleet: "atv-fleet-state-v1", guideSessions: "atv-guide-sessions-v1", communicationRoom: "atv-communication-room-v1", vehicleFlow: "atv-vehicle-flow-v1", runQueue: "atv-run-queue-v1", mechanicState: "atv-mechanic-state-v1", guideState: "atv-guide-state-v1" });
  });

  it("round-trips JSON payloads and rejects malformed payloads", () => {
    const value = { fleetGroups: [{ id: "fleet-1", managerIds: [12], vehicleNumbers: [7] }], sessions: [{ sessionId: "S-1" }] };
    expect(parseOperationsSnapshot(serializeOperationsSnapshot(value))).toEqual(value);
    expect(parseOperationsSnapshot("not-json")).toBeUndefined();
    expect(parseOperationsSnapshot(undefined)).toBeUndefined();
  });
});
