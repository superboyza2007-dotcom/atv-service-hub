import { describe, expect, it } from "vitest";
import { excludeCurrentGuideMember, guideMembersFromCanonicalDirectory, sortGuideMembersByQueue } from "./guide-member-selector";

describe("guide member selector", () => {
  it("uses only Guide and Mechanic entries from the canonical Supervisor directory", () => {
    expect(guideMembersFromCanonicalDirectory([
      { id: 1001, name: "  ไกด์ เอ ", group: "ไกด์" },
      { id: 1002, name: "ช่าง บี", group: "ช่าง" },
      { id: 1003, name: "หัวหน้า ซี", group: "หัวหน้า" },
      { id: 1004, name: "ดิวตี้ ดี", group: "ดิวตี้" },
      { id: 1005, name: "", group: "ไกด์" },
    ])).toEqual([
      { id: "1001", name: "ไกด์ เอ", role: "Guide", available: true },
      { id: "1002", name: "ช่าง บี", role: "Mechanic", available: true },
    ]);
  });

  it("does not fall back to an old Guide snapshot when the canonical directory has no eligible users", () => {
    expect(guideMembersFromCanonicalDirectory([
      { id: 1003, name: "หัวหน้า ซี", group: "หัวหน้า" },
    ])).toEqual([]);
    expect(guideMembersFromCanonicalDirectory([])).toEqual([]);
  });

  it("excludes the current account by id while keeping other members", () => {
    const members = [
      { id: "1001", name: "บอย" },
      { id: "1002", name: "นก" },
      { id: "2001", name: "ช่างเอ" },
    ];

    expect(excludeCurrentGuideMember(members, "1001", "1001", "บอย")).toEqual([
      { id: "1002", name: "นก" },
      { id: "2001", name: "ช่างเอ" },
    ]);
  });

  it("also excludes a duplicated current name when directory ids differ", () => {
    const members = [
      { id: "legacy-boy", name: " บอย " },
      { id: "1002", name: "นก" },
    ];

    expect(excludeCurrentGuideMember(members, "1001", "1001", "บอย").map(member => member.name)).toEqual(["นก"]);
  });

  it("puts members in the current standby queue first and keeps non-queued members last", () => {
    const members = [
      { id: "1003", name: "นอกคิว" },
      { id: "1002", name: "คิวสอง" },
      { id: "1001", name: "คิวหนึ่ง" },
      { id: "1004", name: "นอกคิวสอง" },
    ];

    expect(sortGuideMembersByQueue(members, ["1001", "1002"]).map(member => member.id)).toEqual(["1001", "1002", "1003", "1004"]);
  });
});
