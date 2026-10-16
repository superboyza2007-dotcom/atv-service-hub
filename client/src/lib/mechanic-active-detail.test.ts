import { describe, expect, it } from "vitest";
import { canMechanicManageSession, mechanicSessionHref, mechanicSessionMemberNames } from "./mechanic-active-detail";

describe("mechanic active detail", () => {
  it("keeps mechanic follow navigation inside the mechanic module", () => {
    expect(mechanicSessionHref("M3-20260826-ช่าง 1")).toBe("/?module=mechanic&sessionId=M3-20260826-%E0%B8%8A%E0%B9%88%E0%B8%B2%E0%B8%87%201");
  });

  it("allows a listed mechanic to manage the active session", () => {
    expect(canMechanicManageSession({ memberId: "42", group: "ช่าง" }, ["42"])).toBe(true);
    expect(canMechanicManageSession({ memberId: "99", group: "ช่าง" }, ["42"])).toBe(false);
  });

  it("allows only the supervisor identity as a non-member", () => {
    expect(canMechanicManageSession({ memberId: "99", group: "หัวหน้า" }, ["42"])).toBe(true);
    expect(canMechanicManageSession({ memberId: "99", group: "ไกด์" }, ["42"])).toBe(false);
  });

  it("resolves active member IDs to directory names instead of displaying raw IDs", () => {
    expect(mechanicSessionMemberNames([4, "M-005", "missing"], [
      { id: 4, name: "ช่างเอ", code: "M-004" },
      { id: 5, name: "ช่างบี", code: "M-005" },
    ])).toEqual(["ช่างเอ", "ช่างบี"]);
  });
});
