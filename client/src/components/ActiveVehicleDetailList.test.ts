import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ActiveVehicleDetailList } from "./ActiveVehicleDetailList";

describe("ActiveVehicleDetailList", () => {
  it("renders the same Guide-style vehicle detail contract for every module", () => {
    const html = renderToStaticMarkup(
      React.createElement(ActiveVehicleDetailList, {
        sessionId: "M3-20260827-4S7O",
        vehicles: [
          { id: "m3-v39", number: 39, cc: "250cc", managers: ["Top", "ASA"], accentColor: "#28e6e1" },
          { id: "m3-v25", number: 25, cc: "200cc", managers: ["Yod"], accentColor: "#81e597" },
        ],
        activeStaff: ["บอย", "ตี่", "Yod"],
        activeRoles: ["Guide", "Mechanic", "Guide"],
        safetyNotices: [],
        onSafetyNoticeOpen: () => undefined,
      }),
    );

    expect(html).toContain("m3-vehicle-card-list m3-active-vehicle-card-list");
    expect(html).not.toContain("vehicle-chip--compact");
    expect((html.match(/vehicle-chip /g) ?? []).length).toBe(2);
    expect(html).toContain("Top");
    expect(html).toContain("ASA");
    expect(html).toContain("Session_ID");
    expect(html).toContain("บอย (Guide) · ตี่ (Mechanic) · Yod (Guide)");
  });
});
