import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const guideSource = readFileSync("client/src/pages/GuideModule3.tsx", "utf8");
const vehicleChoiceSource = readFileSync("client/src/components/VehicleChoiceList.tsx", "utf8");

describe("Active vehicle safety guidance flow", () => {
  it("shows the mechanic guidance indicator for vehicles available to add", () => {
    const addVehicleStart = guideSource.indexOf('activeDialog === "addVehicle" &&');
    const replaceStart = guideSource.indexOf('activeDialog === "replace" &&');

    expect(addVehicleStart).toBeGreaterThanOrEqual(0);
    expect(replaceStart).toBeGreaterThan(addVehicleStart);
    expect(guideSource.slice(addVehicleStart, replaceStart)).toContain("VehicleChoiceList");
    expect(guideSource.slice(addVehicleStart, replaceStart)).toContain("safetyNotices");
    expect(vehicleChoiceSource).toContain("VehicleSafetyNoticeIndicator");
  });

  it("shows the selected replacement vehicle guidance before confirmation", () => {
    const replaceStart = guideSource.indexOf('activeDialog === "replace" &&');
    const removeStart = guideSource.indexOf('activeDialog === "removeVehicle" &&');

    expect(replaceStart).toBeGreaterThanOrEqual(0);
    expect(removeStart).toBeGreaterThan(replaceStart);
    const replaceSection = guideSource.slice(replaceStart, removeStart);
    expect(replaceSection).toContain("VehicleChoiceList");
    expect(replaceSection).toContain("replaceToId");
    expect(replaceSection).toContain("safetyNotices");
  });

  it("keeps the same notice collection on the Active detail cards", () => {
    expect(guideSource).toContain("safetyNotices={safetyNotices}");
    expect(guideSource).toContain("onSafetyNoticeOpen={notices => setSelectedSafetyNoticeId(notices[0]?.id)}");
  });
});
