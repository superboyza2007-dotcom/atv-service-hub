import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const moduleSources = {
  Guide: readFileSync("client/src/pages/GuideModule3.tsx", "utf8"),
  Mechanic: readFileSync("client/src/pages/MechanicModule.tsx", "utf8"),
  Supervisor: readFileSync("client/src/pages/SupervisorModule.tsx", "utf8"),
};

describe("shared vehicle choice coverage", () => {
  it.each(Object.entries(moduleSources))("uses the shared vehicle card in %s", (_moduleName, source) => {
    expect(source).toContain("VehicleChoiceList");
    expect(source).toContain("responsibilityGroups=");
    expect(source).toContain("managerDirectory=");
  });

  it("keeps the remaining native selects limited to non-vehicle form fields", () => {
    expect(moduleSources.Guide).not.toContain("<select");
    expect(moduleSources.Mechanic).not.toMatch(/<select[^>]*(alertVehicle|repairVehicle)/);
    expect(moduleSources.Supervisor).toContain("VehicleChoiceList items={supervisorChoiceItems}");
  });
});
