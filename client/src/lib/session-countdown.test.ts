import { describe, expect, it } from "vitest";
import { formatSessionCountdown, remainingSessionSeconds, sessionTiming } from "./session-countdown";
import { isSessionExpiredAt } from "@shared/session-deadline";

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

  it("uses the scheduled deadline as the same source of truth even when it differs from duration", () => {
    const startedAt = "2026-08-25T09:00:00.000Z";
    const scheduledEndAt = "2026-08-25T09:45:00.000Z";
    const now = Date.parse("2026-08-25T09:30:00.000Z");
    expect(remainingSessionSeconds(startedAt, 30, now, scheduledEndAt)).toBe(900);
    expect(sessionTiming(startedAt, 30, now, scheduledEndAt)).toMatchObject({ remainingSeconds: 900, overtimeSeconds: 0 });
    expect(sessionTiming(startedAt, 30, Date.parse(scheduledEndAt), scheduledEndAt).remainingSeconds).toBe(0);
    expect(isSessionExpiredAt(startedAt, 30, Date.parse(scheduledEndAt), scheduledEndAt)).toBe(true);
    expect(isSessionExpiredAt(startedAt, 30, now, scheduledEndAt)).toBe(false);
    expect(sessionTiming(undefined, 30, Date.parse("2026-08-25T09:40:00.000Z"), scheduledEndAt)).toMatchObject({ remainingSeconds: 300, overtimeSeconds: 0 });
  });
});
