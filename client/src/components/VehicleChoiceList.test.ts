import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { VehicleChoiceList, VehicleChoicePicker, VehicleReplacementPanel } from "./VehicleChoiceList";

const groups = [{
  id: 3001,
  name: "ฝูงเขียว",
  managers: [1001, 1002],
  vehicleNumbers: [12],
  color: "#64d98b",
}];

const directory = [
  { id: 1001, name: "บอย" },
  { id: 1002, name: "ตี่" },
];

const items = [{
  id: "m3-v12",
  number: 12,
  cc: "200",
  statusLabel: "พร้อมใช้",
  accentColor: "#64d98b",
}];

describe("VehicleChoiceList", () => {
  it("renders a shared dark-glass vehicle card with canonical group and manager names", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleChoiceList, {
      items,
      selectedId: "m3-v12",
      responsibilityGroups: groups,
      managerDirectory: directory,
      onSelect: () => undefined,
      actionLabel: "เลือกแทน",
    }));

    expect(html).toContain("vehicle-choice-list");
    expect(html).toContain("vehicle-choice-card is-selected");
    expect(html).toContain("ฝูงเขียว (3001)");
    expect(html).toContain("บอย · ตี่");
    expect(html).toContain("พร้อมใช้");
    expect(html).not.toContain("<select");
  });

  it("keeps legacy manager fallback names deduplicated in the same card contract", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleChoiceList, {
      items: [{ ...items[0], fallbackGroupLabel: "ฝูงเดิม", fallbackManagers: ["บอย · บอย", "ตี่"] }],
      onSelect: () => undefined,
    }));

    expect(html).toContain("ฝูงเดิม");
    expect(html).toContain("บอย · ตี่");
    expect(html).not.toContain("บอย · บอย");
  });
});

describe("VehicleReplacementPanel", () => {
  it("renders the same framed card list for current and replacement vehicles", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleReplacementPanel, {
      currentItems: items,
      replacementItems: [{ ...items[0], id: "m3-v17", number: 17 }],
      selectedFromId: "m3-v12",
      selectedToId: "m3-v17",
      onFromSelect: () => undefined,
      onToSelect: () => undefined,
      onConfirm: () => undefined,
      responsibilityGroups: groups,
      managerDirectory: directory,
    }));

    expect(html).toContain("รถที่จะเอาออก");
    expect(html).toContain("รถที่จะนำเข้าแทน");
    expect((html.match(/vehicle-choice-list/g) ?? []).length).toBe(2);
    expect(html).toContain("ยืนยันเปลี่ยนรถ");
  });
});

describe("VehicleChoicePicker", () => {
  it("renders a button trigger instead of a native select", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleChoicePicker, {
      items,
      responsibilityGroups: groups,
      managerDirectory: directory,
      onSelect: () => undefined,
      ariaLabel: "เลือกเบอร์รถสำหรับแจ้งซ่อม",
    }));

    expect(html).toContain("vehicle-choice-picker-trigger");
    expect(html).toContain("เลือกรถ");
    expect(html).not.toContain("<select");
  });
});
