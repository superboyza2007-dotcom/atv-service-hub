import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const projectRoot = new URL("../../../", import.meta.url);

function readProjectFile(relativePath: string) {
  return readFileSync(new URL(relativePath, projectRoot), "utf8");
}

function clientSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return clientSourceFiles(path);
    return /\.[jt]sx?$/.test(entry.name) && !/\.test\.[jt]sx?$/.test(entry.name) ? [path] : [];
  });
}

describe("server-only business persistence", () => {
  it("keeps Mechanic and Supervisor pages free of browser business persistence", () => {
    const mechanic = readProjectFile("client/src/pages/MechanicModule.tsx");
    const supervisor = readProjectFile("client/src/pages/SupervisorModule.tsx");

    for (const source of [mechanic, supervisor]) {
      expect(source).not.toMatch(/localStorage|sessionStorage|StorageEvent/);
      expect(source).not.toMatch(/readSnapshot|readVehicleResponsibilityState|writeVehicleResponsibilityState|readStoredVehiclePickupRequests/);
    }
  });

  it("keeps the shared directory hook server-only", () => {
    const directoryHook = readProjectFile("client/src/hooks/useCanonicalAppDirectory.ts");
    expect(directoryHook).not.toMatch(/localStorage|sessionStorage|StorageEvent/);
    expect(directoryHook).toMatch(/trpc\.directory\.list\.useQuery/);
  });

  it("never reads or writes browser persistence anywhere in the shipped client source", () => {
    const root = fileURLToPath(new URL("client/src/", projectRoot));
    for (const file of clientSourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      expect(source, file).not.toMatch(/(?:localStorage|sessionStorage)\s*(?:\.|\[)|\bindexedDB\s*(?:\.|\[)|document\.cookie|\bVITE_OFFLINE_MODE\b/);
    }
  });

  it("enters the app access gate directly without a device-permission setup screen", () => {
    const app = readProjectFile("client/src/App.tsx");
    expect(app).toContain("<AppAccessGate");
    expect(app).not.toMatch(/DevicePermissionCenter|devicePermissions/);
    expect(readProjectFile("server/routers.ts")).not.toMatch(/devicePermissions/);
  });

  it("keeps Guide business state on Server snapshots", () => {
    const guide = readProjectFile("client/src/pages/GuideModule3.tsx");
    expect(guide).not.toMatch(/readStoredRepairReports|readStoredVehiclePickupRequests|readVehicleSafetyNotices|persistVehiclePickupRequests|persistRepairReports|GUIDE_APP_SHARED_STATE_STORAGE|atv-guide-module-3-standalone-v1/);
    expect(guide).toContain("OPERATIONS_SNAPSHOT_KEYS.guideState");
    expect(guide).toContain("OPERATIONS_SNAPSHOT_KEYS.fleet");
    expect(guide).toContain("vehicleFlowSnapshotQuery");
    expect(guide).toContain("remote?.safetyNotices");
    expect(guide).toContain("setIsGuideSnapshotHydrated(true)");
  });
});
