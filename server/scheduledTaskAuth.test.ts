import { describe, expect, it } from "vitest";
import { isMatchingScheduledTask, shouldRunDailyLiveMessageCleanup } from "./scheduledTaskAuth";

describe("scheduled task callback guards", () => {
  it("requires a cron identity and the exact taskUid stored by the app", () => {
    expect(isMatchingScheduledTask({ isCron: true, taskUid: "task-123" }, "task-123")).toBe(true);
    expect(isMatchingScheduledTask({ isCron: false, taskUid: "task-123" }, "task-123")).toBe(false);
    expect(isMatchingScheduledTask({ isCron: true, taskUid: "task-other" }, "task-123")).toBe(false);
    expect(isMatchingScheduledTask({ isCron: true }, "task-123")).toBe(false);
    expect(isMatchingScheduledTask({ isCron: true, taskUid: "task-123" }, null)).toBe(false);
  });

  it("allows the first daily cleanup and prevents immediate retries from clearing fresh messages", () => {
    const now = new Date("2026-09-28T17:00:00.000Z");
    expect(shouldRunDailyLiveMessageCleanup(null, now)).toBe(true);
    expect(shouldRunDailyLiveMessageCleanup(new Date(now.getTime() - 21 * 60 * 60 * 1_000), now)).toBe(true);
    expect(shouldRunDailyLiveMessageCleanup(new Date(now.getTime() - 5 * 60 * 1_000), now)).toBe(false);
    expect(shouldRunDailyLiveMessageCleanup(new Date(now.getTime() + 1_000), now)).toBe(false);
  });
});
