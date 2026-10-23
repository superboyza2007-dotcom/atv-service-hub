import { describe, expect, it } from "vitest";
import { buildPersonalPayoutRows, payoutDateKey, payoutDateKeyFromParts, payoutPageOffsetForDate } from "./mechanic-payout-table";

describe("personal payout date keys", () => {
  it("assigns a UTC timestamp near midnight to the correct Bangkok calendar day", () => {
    expect(payoutDateKey(new Date("2026-08-26T17:30:00.000Z"))).toBe("2026-08-27");
    expect(payoutDateKeyFromParts(2026, 7, 27)).toBe("2026-08-27");
  });

  it("maps the 1st-15th and 16th-end-of-month dates to the correct current half", () => {
    expect(payoutPageOffsetForDate(new Date(2026, 7, 15))).toBe(0);
    expect(payoutPageOffsetForDate(new Date(2026, 7, 16))).toBe(1);
    expect(payoutPageOffsetForDate(new Date(2026, 7, 31))).toBe(1);
  });

  it("counts a completion after midnight in Bangkok on the visible Thai date", () => {
    const rows = buildPersonalPayoutRows({
      year: 2026,
      month: 7,
      half: 2,
      userId: "guide-1",
      sessions: [{
        status: "Completed",
        durationMinutes: 30,
        memberIds: [],
        activeUserId: "guide-1",
        createdAt: "2026-08-26T16:55:00.000Z",
        completedAt: "2026-08-26T17:30:00.000Z",
      }],
    });
    const row = rows.find(item => item.key === "2026-08-27");
    expect(row?.rounds).toEqual([1, 0]);
    expect(row?.sessions).toHaveLength(1);
  });
});
