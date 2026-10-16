import type { VehicleFlowEvent, VehicleStatus } from "../drizzle/schema";

export type AppRole = "user" | "guide" | "mechanic" | "supervisor" | "admin";
export type FleetMembershipRole = "guide" | "mechanic" | null;

export class VehicleFlowRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VehicleFlowRuleError";
  }
}

const hasRole = (role: AppRole, allowed: AppRole[]) => allowed.includes(role);

export function canManageAsGuide(role: AppRole, membershipRole: FleetMembershipRole): boolean {
  return hasRole(role, ["admin", "supervisor"]) || membershipRole === "guide";
}

export function canManageAsMechanic(role: AppRole, membershipRole: FleetMembershipRole): boolean {
  return hasRole(role, ["admin", "supervisor"]) || membershipRole === "mechanic";
}

export function assertVehicleTransition(input: {
  from: VehicleStatus;
  to: VehicleStatus;
  eventType: VehicleFlowEvent;
  appRole: AppRole;
  membershipRole: FleetMembershipRole;
}): void {
  const { from, to, eventType, appRole, membershipRole } = input;
  const requireGuide = () => {
    if (!canManageAsGuide(appRole, membershipRole)) {
      throw new VehicleFlowRuleError("เฉพาะไกด์ผู้รับผิดชอบกลุ่มรถหรือผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้");
    }
  };
  const requireMechanic = () => {
    if (!canManageAsMechanic(appRole, membershipRole)) {
      throw new VehicleFlowRuleError("เฉพาะช่างที่รับผิดชอบกลุ่มรถหรือผู้ดูแลระบบเท่านั้นที่ทำรายการนี้ได้");
    }
  };
  const requireResponsibleGuide = () => {
    if (membershipRole !== "guide") {
      throw new VehicleFlowRuleError("เฉพาะเจ้าของรถในกลุ่มที่รับผิดชอบเท่านั้นที่รับรถได้");
    }
  };

  if (eventType === "guide_reported_repair") {
    requireGuide();
    if (from === "ready" && to === "repair") return;
  }

  if (eventType === "session_started") {
    requireGuide();
    if (from === "ready" && to === "active") return;
  }

  if (eventType === "repair_completed_without_pickup") {
    requireMechanic();
    if (from === "repair" && to === "ready") return;
  }

  if (eventType === "standby_created") {
    requireGuide();
    if (from === "ready" && to === "active") return;
  }

  if (eventType === "session_completed" || eventType === "session_cancelled") {
    if (from === "active" && to === "ready") return;
  }

  if (eventType === "mechanic_marked_pickup") {
    requireMechanic();
    if ((from === "ready" || from === "repair") && to === "pickup") return;
  }

  if (eventType === "guide_received_vehicle") {
    requireResponsibleGuide();
    if (from === "pickup" && to === "ready") return;
  }

  throw new VehicleFlowRuleError(`ไม่อนุญาตให้เปลี่ยนสถานะรถจาก ${from} เป็น ${to} ด้วยเหตุการณ์ ${eventType}`);
}
