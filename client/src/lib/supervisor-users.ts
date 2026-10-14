export const SUPERVISOR_USER_GROUPS = ["ไกด์", "ช่าง", "ดิวตี้", "หัวหน้า"] as const;
export type SupervisorUserGroup = (typeof SUPERVISOR_USER_GROUPS)[number];
export type SupervisorDirectoryUser = { id: number; name: string; group?: string; code?: string; hasCode?: boolean };

type AddUserResult = { users: SupervisorDirectoryUser[]; error?: string };
export type UpdateUserResult = AddUserResult;

export function getSupervisorManagerOptions(users: SupervisorDirectoryUser[]): SupervisorDirectoryUser[] {
  return users.filter(user => Number.isInteger(user.id) && user.name.trim().length > 0);
}

export function updateSupervisorUser(existingUsers: SupervisorDirectoryUser[], userId: number, rawName: string, rawCode: string, group: string): UpdateUserResult {
  const name = rawName.trim();
  const code = rawCode.trim();
  if (!name || !code || !SUPERVISOR_USER_GROUPS.includes(group as SupervisorUserGroup)) return { users: existingUsers, error: "กรุณากรอกชื่อ รหัส และเลือกกลุ่มผู้ใช้งาน" };
  if (!existingUsers.some(user => user.id === userId)) return { users: existingUsers, error: "ไม่พบผู้ใช้งานที่ต้องการแก้ไข" };
  if (existingUsers.some(user => user.id !== userId && user.code?.trim().toLowerCase() === code.toLowerCase())) return { users: existingUsers, error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" };
  return { users: existingUsers.map(user => user.id === userId ? { ...user, name, code, group } : user), error: "" };
}

export function addSupervisorUser(existingUsers: SupervisorDirectoryUser[], rawName: string, rawCode: string, group: string): AddUserResult {
  const name = rawName.trim();
  const code = rawCode.trim();
  if (!name || !code || !SUPERVISOR_USER_GROUPS.includes(group as SupervisorUserGroup)) {
    return { users: existingUsers, error: "กรุณากรอกชื่อ รหัส และเลือกกลุ่มผู้ใช้งาน" };
  }
  if (existingUsers.some(user => user.code?.trim().toLowerCase() === code.toLowerCase())) {
    return { users: existingUsers, error: "รหัสนี้มีอยู่แล้ว กรุณาใช้รหัสอื่น" };
  }
  const nextId = Math.max(0, ...existingUsers.map(user => user.id)) + 1;
  return { users: [...existingUsers, { id: nextId, name, code, group }] };
}
