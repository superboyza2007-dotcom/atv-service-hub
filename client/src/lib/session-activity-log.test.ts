import { describe, expect, it } from "vitest";
import { appendSessionActivity, createSessionActivity, sessionActivitiesOrFallback, sortSessionActivities } from "./session-activity-log";

describe("session activity log", () => {
  it("appends actions without mutating the previous log", () => {
    const first = createSessionActivity({ actorId: "7", actorName: "บอย", action: "สร้างรายการ", createdAt: "2026-08-26T08:00:00.000Z" });
    const second = createSessionActivity({ actorId: "8", actorName: "ช่างเอ", action: "เริ่มงาน", createdAt: "2026-08-26T08:01:00.000Z" });
    const original = [first];
    const next = appendSessionActivity(original, second);
    expect(original).toHaveLength(1);
    expect(next.map(item => item.action)).toEqual(["สร้างรายการ", "เริ่มงาน"]);
  });

  it("sorts actions chronologically", () => {
    const activities = [
      createSessionActivity({ actorName: "ระบบ", action: "จบงาน", createdAt: "2026-08-26T08:03:00.000Z" }),
      createSessionActivity({ actorName: "บอย", action: "สร้างรายการ", createdAt: "2026-08-26T08:00:00.000Z" }),
    ];
    expect(sortSessionActivities(activities).map(item => item.action)).toEqual(["สร้างรายการ", "จบงาน"]);
  });

  it("uses completedByName for legacy completion activity", () => {
    const activities = sessionActivitiesOrFallback({ sessionId: "M3-LEGACY", createdAt: "2026-08-26T08:00:00.000Z", activeUserName: "บอย", completedAt: "2026-08-26T08:35:00.000Z", completedByName: "ช่างเอ" });
    expect(activities.at(-1)).toMatchObject({ action: "จบงาน → Completed", actorName: "ช่างเอ" });
  });

  it("builds a readable fallback for old sessions", () => {
    const activities = sessionActivitiesOrFallback({
      sessionId: "M3-OLD",
      createdAt: "2026-08-26T08:00:00.000Z",
      startedAt: "2026-08-26T08:05:00.000Z",
      completedAt: "2026-08-26T08:35:00.000Z",
      activeUserId: "7",
      activeUserName: "บอย",
    });
    expect(activities.map(item => item.action)).toEqual(["สร้างรายการ", "เริ่มงาน → Active", "จบงาน → Completed"]);
    expect(activities.every(item => item.actorName === "บอย")).toBe(true);
  });
});
