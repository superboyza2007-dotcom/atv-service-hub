import { describe, expect, it } from "vitest";
import { buildDailyActiveTimeline, groupDailyActiveTimelineBySlot } from "./daily-active-timeline";

describe("buildDailyActiveTimeline", () => {
  it("uses actual startedAt time, excludes other days, and keeps chronological order", () => {
    const sessions = [
      { id: "late", startedAt: "2026-08-25T15:20:00+07:00" },
      { id: "waiting" },
      { id: "early", startedAt: "2026-08-25T08:05:00+07:00" },
      { id: "other-day", startedAt: "2026-08-24T08:00:00+07:00" },
    ];

    expect(buildDailyActiveTimeline(sessions, new Date("2026-08-25T12:00:00+07:00")).map(session => session.id)).toEqual(["early", "late"]);
  });

  it("keeps the original board headings and orders sessions inside their real start-time window", () => {
    const sessions = [
      { id: "nine-thirty", startedAt: "2026-08-25T09:30:00+07:00" },
      { id: "eight-ten", startedAt: "2026-08-25T08:10:00+07:00" },
      { id: "ten-o-five", startedAt: "2026-08-25T10:05:00+07:00" },
      { id: "thirteen", startedAt: "2026-08-25T13:00:00+07:00" },
      { id: "fifteen", startedAt: "2026-08-25T15:00:00+07:00" },
    ];
    const grouped = groupDailyActiveTimelineBySlot(sessions, new Date("2026-08-25T12:00:00+07:00"));

    expect(grouped["08:00"].map(session => session.id)).toEqual(["eight-ten", "nine-thirty"]);
    expect(grouped["10:00"].map(session => session.id)).toEqual(["ten-o-five"]);
    expect(grouped["13:00"].map(session => session.id)).toEqual(["thirteen"]);
    expect(grouped["15:00"].map(session => session.id)).toEqual(["fifteen"]);
  });

  it("uses the Bangkok operational date even when the browser's date is still the previous UTC day", () => {
    const sessions = [
      { id: "after-midnight-bangkok", startedAt: "2026-08-24T17:30:00.000Z" },
      { id: "previous-bangkok-day", startedAt: "2026-08-24T16:30:00.000Z" },
    ];
    const selectedDay = new Date("2026-08-24T18:00:00.000Z");

    expect(buildDailyActiveTimeline(sessions, selectedDay).map(session => session.id)).toEqual(["previous-bangkok-day", "after-midnight-bangkok"]);
    expect(groupDailyActiveTimelineBySlot(sessions, selectedDay)["08:00"].map(session => session.id)).toEqual(["after-midnight-bangkok"]);
  });
  it("starts a new operational day at 07:00 Bangkok time", () => {
    const sessions = [
      { id: "before-seven", startedAt: "2026-08-25T06:59:00+07:00" },
      { id: "at-seven", startedAt: "2026-08-25T07:00:00+07:00" },
    ];
    expect(buildDailyActiveTimeline(sessions, new Date("2026-08-25T06:59:30+07:00")).map(session => session.id)).toEqual(["before-seven"]);
    expect(buildDailyActiveTimeline(sessions, new Date("2026-08-25T07:00:00+07:00")).map(session => session.id)).toEqual(["at-seven"]);
  });
});
