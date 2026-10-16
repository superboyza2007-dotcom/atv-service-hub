import { describe, expect, it } from "vitest";
import { mergeSessionChatMessages, normalizeSessionChatMessages } from "./session-chat-sync";

const first = { id: "m-1", sessionId: "S-1", sender: "ไกด์", text: "เริ่มงาน", createdAt: "2026-08-28T00:00:00.000Z" };
const second = { id: "m-2", sessionId: "S-1", sender: "ช่าง", text: "รับทราบ", createdAt: "2026-08-28T00:01:00.000Z" };

describe("shared session chat", () => {
  it("keeps only valid session messages", () => {
    expect(normalizeSessionChatMessages([first, { id: "bad" }, second])).toEqual([first, second]);
  });

  it("merges local and remote messages without duplicate ids in chronological order", () => {
    expect(mergeSessionChatMessages([second, first], [first, { ...second, text: "ข้อความซ้ำจากอีกจอ" }])).toEqual([first, second]);
  });

  it("does not mix messages from another session into the selected session", () => {
    expect(mergeSessionChatMessages([first], [{ ...second, sessionId: "S-2" }])).toEqual([first, { ...second, sessionId: "S-2" }]);
  });
});
