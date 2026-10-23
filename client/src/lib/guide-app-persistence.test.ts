import { describe, expect, it } from "vitest";
import { readGuideAppSnapshot, serializeGuideAppSnapshot } from "./guide-app-persistence";

describe("guide app persistence", () => {
  it("prefers the shared snapshot so switching modules keeps the same app data", () => {
    const values = new Map([
      ["shared", JSON.stringify({ sessions: [{ id: "shared-session" }] })],
      ["legacy", JSON.stringify({ sessions: [{ id: "legacy-session" }] })],
    ]);
    expect(readGuideAppSnapshot(key => values.get(key) ?? null, "shared", "legacy")).toEqual({ sessions: [{ id: "shared-session" }] });
  });

  it("falls back to the legacy snapshot when the shared snapshot is missing or malformed", () => {
    const values = new Map([["shared", "not-json"], ["legacy", JSON.stringify({ sessions: [{ id: "old-session" }] })]]);
    expect(readGuideAppSnapshot(key => values.get(key) ?? null, "shared", "legacy")).toEqual({ sessions: [{ id: "old-session" }] });
  });

  it("serializes one complete snapshot without dropping empty collections", () => {
    expect(serializeGuideAppSnapshot({ sessions: [], repairReports: [], payoutRoundValues: {} })).toBe('{"sessions":[],"repairReports":[],"payoutRoundValues":{}}');
  });
});
