import { describe, expect, it } from "vitest";
import { completionTimingDetail, formatCompletionDifference, sessionCompletionTiming } from "./session-completion-timing";

describe("session completion timing", () => {
  it("reports minutes completed before the planned duration", () => {
    const timing = sessionCompletionTiming("2026-08-27T03:00:00.000Z", "2026-08-27T03:25:00.000Z", 30);
    expect(timing.earlySeconds).toBe(300);
    expect(timing.overtimeSeconds).toBe(0);
    expect(completionTimingDetail(timing)).toBe("จบก่อนโปรแกรม 5 นาที");
  });

  it("reports overtime after the planned duration", () => {
    const timing = sessionCompletionTiming("2026-08-27T03:00:00.000Z", "2026-08-27T04:07:00.000Z", 60);
    expect(timing.earlySeconds).toBe(0);
    expect(timing.overtimeSeconds).toBe(420);
    expect(completionTimingDetail(timing)).toBe("เกินโปรแกรม 7 นาที");
  });

  it("keeps an exact completion neutral and formats seconds when needed", () => {
    const timing = sessionCompletionTiming("2026-08-27T03:00:00.000Z", "2026-08-27T03:30:00.000Z", 30);
    expect(timing.earlySeconds).toBe(0);
    expect(timing.overtimeSeconds).toBe(0);
    expect(completionTimingDetail(timing)).toBe("จบตรงตามเวลาโปรแกรม");
    expect(formatCompletionDifference(65)).toBe("1 นาที 5 วินาที");
  });
});
