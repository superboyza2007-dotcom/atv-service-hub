import { describe, expect, it } from "vitest";
import { canOpenModule, identityFromServerSession, moduleForUserGroup, resolveAppActor } from "./app-access";

describe("server-session app access", () => {
  it("maps directory groups to their permitted module", () => {
    expect(moduleForUserGroup("ทีมไกด์")).toBe("guide");
    expect(moduleForUserGroup("ทีมช่าง")).toBe("mechanic");
    expect(moduleForUserGroup("หัวหน้างาน")).toBe("supervisor");
    expect(moduleForUserGroup("ดิวตี้")).toBeNull();
  });

  it("uses the server's current user and never accepts a browser-stored code", () => {
    const identity = identityFromServerSession({ id: 2, name: "Mechanic One", group: "ทีมช่าง", special: false });
    expect(identity).toEqual({ memberId: 2, name: "Mechanic One", group: "ทีมช่าง", module: "mechanic", special: false });
    expect(canOpenModule(identity!, "mechanic")).toBe(true);
    expect(canOpenModule(identity!, "mechanicTips")).toBe(false);
    expect(canOpenModule(identity!, "guide")).toBe(false);
    expect(identityFromServerSession(null)).toBeNull();
  });

  it("allows guides to open only the mechanic warning workspace", () => {
    const identity = identityFromServerSession({ id: 7, name: "Guide One", group: "ทีมไกด์", special: false });
    expect(canOpenModule(identity!, "mechanicTips")).toBe(true);
    expect(canOpenModule(identity!, "mechanic")).toBe(false);
  });

  it("grants special module choice only for a server-confirmed special session", () => {
    const identity = identityFromServerSession({ name: "ผู้ดูแลและพัฒนาระบบ", group: "ผู้ดูแลและพัฒนาระบบ", special: true });
    expect(identity?.module).toBeNull();
    expect(canOpenModule(identity!, "guide")).toBe(true);
    expect(canOpenModule(identity!, "supervisor")).toBe(true);
    expect(resolveAppActor(identity!, { id: "1", name: "บอย" })).toEqual({ id: "special:server-session", name: "ผู้ดูแลและพัฒนาระบบ" });
  });
});
