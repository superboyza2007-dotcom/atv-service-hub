import { describe, expect, it } from "vitest";
import { normalizeCanonicalDirectoryUsers } from "./useCanonicalAppDirectory";

describe("canonical app directory", () => {
  it("normalizes one shared directory shape and ignores malformed rows", () => {
    expect(normalizeCanonicalDirectoryUsers([
      { id: 2, name: "  ช่างหนึ่ง  ", code: " M-002 ", group: " ช่าง " },
      { id: 3, name: "ไม่มีรหัส", group: "ไกด์" },
      { id: "4", name: "ชนิดผิด", code: "G-004", group: "ไกด์" },
      { id: 5, name: " ", code: "G-005", group: "ไกด์" },
      null,
    ])).toEqual([
      { id: 2, name: "ช่างหนึ่ง", code: "M-002", group: "ช่าง", hasCode: false },
      { id: 3, name: "ไม่มีรหัส", code: undefined, group: "ไกด์", hasCode: false },
    ]);
  });

  it("preserves directory row identity when the display fields are edited", () => {
    const before = normalizeCanonicalDirectoryUsers([{ id: 7, name: "เดิม", code: "OLD-7", group: "ช่าง" }]);
    const after = normalizeCanonicalDirectoryUsers([{ id: 7, name: "ใหม่", code: "NEW-7", group: "หัวหน้า" }]);
    expect(after[0]?.id).toBe(before[0]?.id);
    expect(after[0]).toMatchObject({ name: "ใหม่", code: "NEW-7", group: "หัวหน้า" });
  });
});
