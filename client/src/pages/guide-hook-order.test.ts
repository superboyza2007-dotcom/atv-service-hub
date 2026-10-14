import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("GuideModule3 hook order", () => {
  it("keeps repair hook before the shared Guide drill-down flow", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/GuideModule3.tsx"), "utf8");
    const hook = source.indexOf("const openRepairNumbers = useMemo");
    const sharedFlow = source.indexOf('if (screen === "groups") return <VehicleResponsibilityGroupView');
    expect(hook).toBeGreaterThanOrEqual(0);
    expect(sharedFlow).toBeGreaterThanOrEqual(0);
    expect(hook).toBeLessThan(sharedFlow);
    expect(source.match(/const openRepairNumbers = useMemo/g)).toHaveLength(1);
    expect(source).not.toContain('if (screen === "status" && selectedGroupId !== undefined)');
  });

  it("writes received pickup state to the Supervisor fleet snapshot", () => {
    const guide = readFileSync(resolve(process.cwd(), "client/src/pages/GuideModule3.tsx"), "utf8");
    const mechanic = readFileSync(resolve(process.cwd(), "client/src/pages/MechanicModule.tsx"), "utf8");
    expect(guide).toContain("receiveVehiclePickupForGuide(pickupRequests, request.id");
    expect(guide).toContain("saveSupervisorFleetSnapshotMutation.mutate({ key: OPERATIONS_SNAPSHOT_KEYS.fleet");
    expect(guide).toContain("pickupRequests: nextRequests");
    expect(mechanic).toContain("supervisorFleetSnapshotQuery");
    expect(mechanic).toContain("mergeVehiclePickupRequests([], remote.pickupRequests)");
    expect(mechanic).toContain("saveSupervisorFleetSnapshotMutation.mutate");
  });

  it("does not let repair snapshot refresh navigate Guide to Standby", () => {
    const guide = readFileSync(resolve(process.cwd(), "client/src/pages/GuideModule3.tsx"), "utf8");
    const mechanic = readFileSync(resolve(process.cwd(), "client/src/pages/MechanicModule.tsx"), "utf8");
    expect(guide).toContain("A repair/status snapshot refresh must never change the current screen to Standby");
    expect(guide).toContain("}, [isStorageHydrated, selectedSessionId]);");
    expect(guide).not.toContain("}, [isStorageHydrated, selectedSessionId, sessions]);");
    expect(mechanic).toContain("serializeOperationsSnapshot({ repairReports:");
    expect(mechanic).not.toContain("serializeOperationsSnapshot({ sessions: readGuideSessions(), messages: latestSnapshot.messages, repairReports:");
  });
});
