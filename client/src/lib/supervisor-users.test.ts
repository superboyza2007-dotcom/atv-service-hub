import { describe, expect, it } from "vitest";
import { addSupervisorUser, getSupervisorManagerOptions, SUPERVISOR_USER_GROUPS, updateSupervisorUser } from "./supervisor-users";

describe("supervisor users", () => {
  it("supports the four requested user groups", () => {
    expect(SUPERVISOR_USER_GROUPS).toEqual(["ไกด์", "ช่าง", "ดิวตี้", "หัวหน้า"]);
  });

  it("adds a trimmed user with the next numeric id", () => {
    const result = addSupervisorUser([{ id: 10, name: "เดิม", code: "G-010", group: "ไกด์" }], "  ใหม่  ", " M-011 ", "ช่าง");
    expect(result.error).toBeUndefined();
    expect(result.users.at(-1)).toEqual({ id: 11, name: "ใหม่", code: "M-011", group: "ช่าง" });
  });

  it("rejects missing fields and duplicate codes without changing the list", () => {
    const users = [{ id: 10, name: "เดิม", code: "G-010", group: "ไกด์" }];
    expect(addSupervisorUser(users, "", "G-011", "ไกด์").error).toBeTruthy();
    expect(addSupervisorUser(users, "ใหม่", "g-010", "หัวหน้า").error).toContain("มีอยู่แล้ว");
    expect(addSupervisorUser(users, "ใหม่", "G-011", "ผู้ดูแล").error).toBeTruthy();
    expect(users).toHaveLength(1);
  });

  it("uses the system directory as manager options", () => {
    const users = [
      { id: 1, name: "ไกด์หนึ่ง", code: "G-001", group: "ไกด์" },
      { id: 2, name: "ช่างสอง", code: "M-002", group: "ช่าง" },
      { id: 3, name: "", code: "", group: "หัวหน้า" },
    ];
    expect(getSupervisorManagerOptions(users)).toEqual(users.slice(0, 2));
  });

  it("updates a user and rejects a code used by another user", () => {
    const users = [
      { id: 1, name: "เดิม", code: "G-001", group: "ไกด์" },
      { id: 2, name: "ช่างเดิม", code: "M-002", group: "ช่าง" },
    ];
    const result = updateSupervisorUser(users, 1, "  ไกด์ใหม่ ", " G-009 ", "หัวหน้า");
    expect(result.error).toBe("");
    expect(result.users[0]).toEqual({ id: 1, name: "ไกด์ใหม่", code: "G-009", group: "หัวหน้า" });
    expect(updateSupervisorUser(users, 1, "ใหม่", "m-002", "ไกด์").error).toContain("มีอยู่แล้ว");
  });
});
