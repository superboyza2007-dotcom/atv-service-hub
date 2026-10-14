import { describe, expect, it } from "vitest";
import { supervisorActiveTimeLabel } from "./supervisor-active-timing";

describe("supervisor active timing", () => {
  it("แสดงเวลาคงเหลือระหว่างโปรแกรม", () => {
    const result = supervisorActiveTimeLabel("2026-08-25T09:00:00.000Z", 30, Date.parse("2026-08-25T09:05:37.000Z"));
    expect(result.label).toBe("เหลือเวลา 24:23");
    expect(result.overtimeSeconds).toBe(0);
  });

  it("แสดงเวลาบวกเมื่อเกินโปรแกรมแทน 00:00", () => {
    const result = supervisorActiveTimeLabel("2026-08-25T09:00:00.000Z", 30, Date.parse("2026-08-25T09:36:12.000Z"));
    expect(result.label).toBe("เวลาบวก +06:12");
    expect(result.remainingSeconds).toBe(0);
    expect(result.overtimeSeconds).toBe(372);
  });
});
