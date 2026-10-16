/* Design reminder: Thai mobile-first ATV operations; permissions stay explicit, readable, and ready for future module consolidation. */

export type RoleId = "MANAGER" | "DUTY" | "GUIDE" | "MECHANIC" | "BEAUTY" | "SUPERVISOR";
export type PermissionAction = "edit" | "delete" | "changeVehicle";

export const ROLE_LABELS: Record<RoleId, string> = {
  MANAGER: "Manager",
  DUTY: "Duty",
  GUIDE: "Guide",
  MECHANIC: "Mechanic",
  BEAUTY: "Beauty",
  SUPERVISOR: "Supervisor",
};

export function roleFromUserGroup(group?: string): RoleId {
  if (group === "Duty สั่งงาน") return "DUTY";
  if (group?.includes("ไกด์")) return "GUIDE";
  if (group?.includes("ช่าง")) return "MECHANIC";
  if (group === "Supervisor" || group?.includes("หัวหน้า")) return "SUPERVISOR";
  return "MANAGER";
}

export function canUsePermission(roleId: RoleId, action: PermissionAction, isSessionMember = false) {
  if (roleId === "MANAGER" || roleId === "DUTY" || roleId === "SUPERVISOR") return true;
  if (action === "changeVehicle" || action === "edit" || action === "delete") return isSessionMember;
  return false;
}

export function canManageActiveSession(roleId: RoleId, isSessionMember: boolean) {
  return roleId === "SUPERVISOR" || isSessionMember;
}

export function canSendSessionMessage(hasSession: boolean) {
  return hasSession;
}

export function permissionMessage(action: PermissionAction) {
  const labels: Record<PermissionAction, string> = {
    edit: "แก้ไขรายการ",
    delete: "ลบข้อมูล",
    changeVehicle: "เปลี่ยนรถ",
  };
  return `Role_ID ปัจจุบันไม่มีสิทธิ์${labels[action]}รายการนี้`;
}
