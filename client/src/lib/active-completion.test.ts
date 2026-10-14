import { describe, expect, it } from "vitest";
import { activeCompletionCopy, createActiveCompletionPrompt, isActiveCompletionPromptFor } from "./active-completion";

describe("active completion prompts", () => {
  it("creates a manual confirmation prompt for the selected session", () => {
    const prompt = createActiveCompletionPrompt("M3-20260827-TEST");
    expect(prompt).toEqual({ sessionId: "M3-20260827-TEST", kind: "manual" });
    expect(isActiveCompletionPromptFor(prompt, "M3-20260827-TEST")).toBe(true);
    expect(isActiveCompletionPromptFor(prompt, "M3-20260827-OTHER")).toBe(false);
  });

  it("uses the overtime copy for the timeout confirmation branch", () => {
    const prompt = createActiveCompletionPrompt("M3-20260827-TEST", "expired");
    const copy = activeCompletionCopy(prompt.kind);
    expect(copy.eyebrow).toBe("ACTIVE TIMEOUT");
    expect(copy.secondary).toBe("ยังไม่จบ");
    expect(copy.message).toContain("นับเวลาบวกต่อ");
  });
});
