export type ActiveCompletionPromptKind = "manual" | "expired";
export type ActiveCompletionPrompt = { sessionId: string; kind: ActiveCompletionPromptKind };

export function createActiveCompletionPrompt(sessionId: string, kind: ActiveCompletionPromptKind = "manual"): ActiveCompletionPrompt {
  return { sessionId, kind };
}

export function isActiveCompletionPromptFor(prompt: ActiveCompletionPrompt | null | undefined, sessionId: string) {
  return prompt?.sessionId === sessionId;
}

export function activeCompletionCopy(kind: ActiveCompletionPromptKind) {
  return kind === "expired"
    ? { eyebrow: "ACTIVE TIMEOUT", title: "รายการ Active หมดเวลาแล้ว", message: "โปรแกรมครบเวลาแล้ว ต้องยืนยันว่าจะจบงาน หรือให้รายการนับเวลาบวกต่อจนกว่าจะยืนยันจบ", secondary: "ยังไม่จบ" }
    : { eyebrow: "ACTIVE COMPLETION", title: "ยืนยันจบและคืนรถ", message: "ตรวจสอบว่าการทำงานเสร็จแล้ว รถทุกคันจะกลับเป็นสถานะพร้อมใช้", secondary: "ยกเลิก" };
}
