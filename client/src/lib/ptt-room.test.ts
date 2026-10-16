import { describe, expect, it } from "vitest";
import { getPttSocketUrl, pttModuleFromQuery, pttModuleLabel, PTT_ROOM_ID, shouldPromptForPttAccess } from "./ptt-room";

describe("ptt room helpers", () => {
  it("uses one shared room for every module", () => {
    expect(PTT_ROOM_ID).toBe("atv-operations-main");
    expect(pttModuleFromQuery("?module=guide")).toBe("guide");
    expect(pttModuleFromQuery("?module=mechanic")).toBe("mechanic");
    expect(pttModuleFromQuery("?module=supervisor")).toBe("supervisor");
  });

  it("falls back to guide for an unknown module", () => {
    expect(pttModuleFromQuery("?module=unknown")).toBe("guide");
    expect(pttModuleLabel("guide")).toBe("ไกด์");
    expect(pttModuleLabel("mechanic")).toBe("ช่าง");
    expect(pttModuleLabel("supervisor")).toBe("หัวหน้า");
  });

  it("opens device access only after the room is connected and permission is missing", () => {
    expect(shouldPromptForPttAccess(false, false)).toBe(false);
    expect(shouldPromptForPttAccess(true, false)).toBe(true);
    expect(shouldPromptForPttAccess(true, true)).toBe(false);
  });

  it("uses the current page protocol for websocket signaling", () => {
    expect(getPttSocketUrl({ protocol: "https:", host: "atv.example.test" })).toBe("wss://atv.example.test/api/ptt");
    expect(getPttSocketUrl({ protocol: "http:", host: "localhost:3000" })).toBe("ws://localhost:3000/api/ptt");
  });
});

  it("can recover after a denied setting by prompting again only while permission is missing", () => {
    expect(shouldPromptForPttAccess(true, false)).toBe(true);
    expect(shouldPromptForPttAccess(true, true)).toBe(false);
  });
