import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Supervisor User Directory status doors", () => {
  it("connects both CC cards and the shared total-status card to the canonical Supervisor model", () => {
    const source = read("client/src/components/DisconnectedVehicleStatusCards.tsx");
    expect(source).toContain('(["200", "250"] as const)');
    expect(source).toContain('data-status-source="supervisor-user-directory"');
    expect(source).toContain('data-vehicle-cc={cc}');
    expect(source).toContain("statusModel.byCc[cc]");
    expect(source).toContain("STATUS_METRICS");
    expect(source).toContain("GuideVehicleStatusSummary");
    expect(source).toContain("statusModel={statusModel}");
    expect(source).not.toContain("ถอดการเชื่อมต่อข้อมูลแล้ว");
  });

  it("connects the Mechanic homepage card and inner Group View to the same Supervisor reader", () => {
    const source = read("client/src/pages/MechanicModule.tsx");
    const dashboard = source.slice(source.indexOf('if (tab === "dashboard")'), source.indexOf("  const tabTitle ="));
    expect(source).toContain("buildSupervisorUserDirectoryStatusSource");
    expect(source).toContain("buildSupervisorUserDirectoryStatusModel");
    expect(dashboard).toContain("statusModel={supervisorStatusModel}");
    expect(dashboard).toContain("<DisconnectedVehicleStatusCards");
    expect(dashboard).not.toContain("groupSummaries.map");
    expect(dashboard).not.toContain("allSummary.");
  });

  it("uses the same model for Supervisor Database metrics, homepage card, and inner Group View", () => {
    const source = read("client/src/pages/SupervisorModule.tsx");
    const databaseSummary = source.slice(source.indexOf("const supervisorStatusModel"), source.indexOf("const guideActiveMembers"));
    const databaseMetrics = source.slice(source.indexOf("<div className=\"supervisor-metrics\">"), source.indexOf("<div className=\"supervisor-metrics\">") + 1600);
    const dashboard = source.slice(source.indexOf("function SupervisorDashboard"), source.indexOf("function SupervisorDailyBoard"));
    expect(databaseSummary).toContain("canonicalSupervisorStatusModel");
    expect(databaseMetrics).toContain("databaseStatusSummary.total");
    expect(databaseMetrics).toContain("databaseStatusSummary.ready");
    expect(databaseMetrics).toContain("databaseStatusSummary.repair");
    expect(databaseMetrics).toContain("databaseStatusSummary.inspection");
    expect(databaseMetrics).toContain("databaseStatusSummary.pickup");
    expect(databaseMetrics).toContain("databaseStatusSummary.active");
    expect(dashboard).toContain("statusModel={statusModel}");
    expect(source).toContain("statusModel={supervisorStatusModel}");
  });

  it("connects the Guide standard entry point and inner door to the canonical model", () => {
    const guide = read("client/src/pages/GuideModule3.tsx");
    const mechanic = read("client/src/pages/MechanicModule.tsx");
    const supervisor = read("client/src/pages/SupervisorModule.tsx");
    expect(guide).toContain("GuideVehicleStatusSummary");
    expect(guide).toContain("statusModel={guideStatusModel}");
    expect(guide).toContain("buildSupervisorUserDirectoryStatusSource");
    expect(guide).toContain("buildSupervisorUserDirectoryStatusModel");
    expect(mechanic).toContain("statusModel={supervisorStatusModel}");
    expect(supervisor).toContain("statusModel={supervisorStatusModel}");
  });

  it("uses Supervisor Database fleet pickup aggregation as the shared source", () => {
    const mechanic = read("client/src/pages/MechanicModule.tsx");
    const supervisor = read("client/src/pages/SupervisorModule.tsx");
    const guide = read("client/src/pages/GuideModule3.tsx");
    expect(mechanic).toContain("OPERATIONS_SNAPSHOT_KEYS.fleet");
    expect(mechanic).toContain("pickupRequests: nextPickupRequests");
    expect(supervisor).toContain("OPERATIONS_SNAPSHOT_KEYS.fleet");
    expect(supervisor).toContain("Supervisor Database fleet snapshot");
    expect(guide).toContain("OPERATIONS_SNAPSHOT_KEYS.fleet");
    expect(guide).toContain("guideStatusModel");
  });

  it("feeds both 2.1 creators from the canonical Supervisor status model", () => {
    const guide = read("client/src/pages/GuideModule3.tsx");
    const supervisor = read("client/src/pages/SupervisorModule.tsx");
    expect(guide).toContain("buildSupervisorInputVehicles(guideStatusModel)");
    expect(guide).toContain("guideInputVehicles.filter(vehicle => vehicle.cc === cc && isVehicleOperationallyReadyStatus(vehicle.status))");
    expect(guide).not.toContain("selectableVehiclesForGuideInput(vehicles.filter(vehicle => vehicle.cc === cc))");
    expect(supervisor).toContain("buildSupervisorInputVehicles(supervisorStatusModel)");
    expect(supervisor).toContain("vehicles={supervisorStandbyVehicles}");
    expect(supervisor).not.toContain("<SupervisorStandbyCreator vehicles={vehicles}");
  });

  it("removes the legacy ATV Run Queue module and navigation tabs", () => {
    const guide = read("client/src/pages/GuideModule3.tsx");
    const supervisor = read("client/src/pages/SupervisorModule.tsx");
    expect(guide).not.toContain("OriginalQueueModule");
    expect(guide).not.toContain("EmbeddedQueueRegistration");
    expect(guide).not.toContain('<span>รันคิว</span>');
    expect(supervisor).not.toContain("OriginalQueueModule");
    expect(supervisor).not.toContain('label: "รันคิว"');
    expect(supervisor).not.toContain('requested === "queue"');
  });

  it("uses Mechanic warning tab two as the Supervisor guidance source", () => {
    const mechanic = read("client/src/pages/MechanicModule.tsx");
    const supervisor = read("client/src/pages/SupervisorModule.tsx");
    expect(mechanic).toContain('tab === "tips"');
    expect(mechanic).toContain("safetyNotices: nextNotices");
    expect(supervisor).toContain("Mechanic warning tab 2 is authoritative");
    expect(supervisor).toContain("mergeVehicleSafetyNotices([], remote.safetyNotices)");
  });
});
