import { describe, expect, it } from "vitest";
import { resolveActiveMemberIdsByName } from "./active-name-mirror";

describe("resolveActiveMemberIdsByName", () => {
  it("maps names from Active to queue members while ignoring spaces and letter case", () => {
    const members = [{ id: "a", name: "นิด  สุขใจ" }, { id: "b", name: "โต้ง" }, { id: "c", name: "มุก" }];
    expect(resolveActiveMemberIdsByName(members, [" นิด สุขใจ ", "โต้ง"])).toEqual(["a", "b"]);
  });
});
