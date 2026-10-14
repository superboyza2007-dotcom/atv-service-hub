import { describe, expect, it } from "vitest";
import { earliestActiveTimingForNames } from "./active-queue-timing";

describe("earliestActiveTimingForNames", () => {
  it("เลือกเวลาเริ่มจริงที่เก่าที่สุดของสมาชิกใน Active run โดยเทียบชื่อแบบไม่สนช่องว่าง", () => {
    const result = earliestActiveTimingForNames([" บอย  ", "นก"], [
      { name: "นก", startedAt: "2026-08-25T09:10:00+07:00", durationMinutes: 30 },
      { name: "บอย", startedAt: "2026-08-25T09:05:00+07:00", durationMinutes: 60 },
      { name: "ช่างเอ", startedAt: "2026-08-25T09:00:00+07:00", durationMinutes: 30 },
    ]);
    expect(result).toEqual({ name: "บอย", startedAt: "2026-08-25T09:05:00+07:00", durationMinutes: 60 });
  });

  it("ข้าม snapshot ที่ไม่มีเวลาเริ่มหรือระยะเวลาใช้งานได้", () => {
    const result = earliestActiveTimingForNames(["บอย"], [
      { name: "บอย", startedAt: "invalid", durationMinutes: 30 },
      { name: "บอย", startedAt: "2026-08-25T09:05:00+07:00", durationMinutes: 0 },
    ]);
    expect(result).toBeUndefined();
  });
});
