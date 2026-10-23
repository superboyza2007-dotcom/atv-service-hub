import { describe, expect, it } from "vitest";
import { formatSessionCountdown, remainingSessionSeconds, sessionTiming } from "./session-countdown";

describe("session countdown", () => {
  it("คำนวณเวลาคงเหลือจากเวลาเริ่มจริงและโปรแกรม", () => {
    expect(remainingSessionSeconds("2026-08-25T09:00:00.000Z", 30, Date.parse("2026-08-25T09:05:37.000Z"))).toBe(1463);
    expect(formatSessionCountdown(1463)).toBe("24:23");
  });

  it("คำนวณเวลาบวกเมื่อ Active เกินโปรแกรมและไม่ปิดรายการเอง", () => {
    const timing = sessionTiming("2026-08-25T09:00:00.000Z", 30, Date.parse("2026-08-25T09:36:12.000Z"));
    expect(timing.remainingSeconds).toBe(0);
    expect(timing.overtimeSeconds).toBe(372);
    expect(formatSessionCountdown(timing.overtimeSeconds)).toBe("06:12");
  });

  it("ใช้เวลาเต็มเมื่อยังไม่เริ่ม และไม่ให้เวลาติดลบ", () => {
    expect(remainingSessionSeconds(undefined, 30, Date.parse("2026-08-25T09:05:37.000Z"))).toBe(1800);
    expect(remainingSessionSeconds("2026-08-25T09:00:00.000Z", 30, Date.parse("2026-08-25T10:00:00.000Z"))).toBe(0);
  });
});
