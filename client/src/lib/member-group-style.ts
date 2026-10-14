export type MemberGroupKey = "guide" | "mechanic" | "duty" | "supervisor" | "other";

export function memberGroupKey(group?: string): MemberGroupKey {
  const value = String(group ?? "").trim().toLowerCase();
  if (value.includes("guide") || value.includes("ไกด์")) return "guide";
  if (value.includes("mechanic") || value.includes("ช่าง")) return "mechanic";
  if (value.includes("duty") || value.includes("ดิวตี้")) return "duty";
  if (value.includes("supervisor") || value.includes("หัวหน้า")) return "supervisor";
  return "other";
}

export function memberGroupClass(group?: string) {
  return `member-group-${memberGroupKey(group)}`;
}
