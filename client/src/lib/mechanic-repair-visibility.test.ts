import { describe, expect, it } from "vitest";
import { filterActiveMechanicRepairs, getMechanicRepairLog } from "./mechanic-repair-visibility";

const repairs = [
  { id: "RP-1", status: "กำลังซ่อม", decision: "ไม่แจ้งรับรถ" },
  { id: "RP-2", status: "แจ้งรับรถ", decision: "แจ้งรับรถ" },
];

describe("mechanic repair visibility", () => {
  it("keeps unfinished repairs in the active worklist", () => {
    expect(filterActiveMechanicRepairs(repairs).map(repair => repair.id)).toEqual(["RP-1"]);
  });

  it("keeps every repair in the repair log archive, including pickup-completed work", () => {
    expect(getMechanicRepairLog(repairs).map(repair => repair.id)).toEqual(["RP-1", "RP-2"]);
  });
});
