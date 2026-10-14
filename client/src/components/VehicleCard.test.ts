import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import VehicleCard from "./VehicleCard";

describe("VehicleCard manager display", () => {
  it("keeps the original manager row in Guide Active detail and preserves Session staff", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleCard, {
      number: 39,
      cc: "250cc",
      managers: ["บอย", "ตี่"],
      status: "active",
      sessionId: "M3-20260827-4S7O",
      activeStaff: ["บอย", "ตี่", "Yod"],
      activeRoles: ["Guide", "Mechanic", "Guide"],
    }));

    expect(html).toContain("vehicle-manager-list");
    expect(html).toContain("บอย");
    expect(html).toContain("ตี่");
    expect(html).toContain("Session_ID");
    expect(html).toContain("บอย (Guide) · ตี่ (Mechanic) · Yod (Guide)");
  });

  it("removes duplicate names only inside the manager row", () => {
    const html = renderToStaticMarkup(React.createElement(VehicleCard, { number: 25, cc: "200cc", managers: ["บอย", "บอย", "ตี่"] }));
    expect((html.match(/vehicle-manager-slot/g) ?? []).length).toBe(2);
    expect(html).toContain("บอย");
    expect(html).toContain("ตี่");
  });
});
