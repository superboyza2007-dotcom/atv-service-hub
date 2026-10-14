/* Design reminder: Thai mobile-first ATV operations UI; keep the vehicle identity and caregiver details visible in one dense, non-scrolling tile. */
import React from "react";
import { LockKeyhole, X } from "lucide-react";
import { VehicleSafetyNoticeIndicator } from "@/components/VehicleSafetyNotice";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import type { ResponsibilityGroupRecord } from "@/lib/vehicle-responsibility-store";
import { resolveVehicleManagerNames, type ManagerDirectoryEntry } from "@/lib/vehicle-manager-resolver";

type VehicleCardProps = {
  number: number;
  cc: string;
  managers?: string[];
  unavailable?: boolean;
  status?: string;
  sessionId?: string;
  activeStaff?: string[];
  activeRoles?: string[];
  canRemove?: boolean;
  onRemove?: () => void;
  compact?: boolean;
  accentColor?: string;
  safetyNotices?: VehicleSafetyNotice[];
  onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void;
  responsibilityGroups?: ResponsibilityGroupRecord[];
  managerDirectory?: ManagerDirectoryEntry[];
};

export default function VehicleCard({
  number,
  cc,
  managers = [],
  unavailable = false,
  status,
  sessionId,
  activeStaff = [],
  activeRoles = [],
  canRemove = true,
  onRemove,
  compact = false,
  accentColor,
  safetyNotices = [],
  onSafetyNoticeOpen,
  responsibilityGroups,
  managerDirectory,
}: VehicleCardProps) {
  const resolvedManagers = responsibilityGroups && managerDirectory
    ? resolveVehicleManagerNames(number, responsibilityGroups, managerDirectory, managers)
    : [];
  const displayManagers = Array.from(new Set((resolvedManagers.length ? resolvedManagers : managers).map(name => name.trim()).filter(Boolean)));
  const visibleManagers = displayManagers.length > 0 ? displayManagers : ["ยังไม่กำหนด"];

  const style = accentColor ? { "--vehicle-accent": accentColor, borderColor: accentColor } as React.CSSProperties : {};

  return (
    <article className={`vehicle-chip ${compact ? "vehicle-chip--compact" : ""} ${unavailable ? "unavailable" : ""} ${status ?? ""}`} style={style}>
      <div className="vehicle-chip-identity">
        <div className="vehicle-chip-topline">
          <strong style={accentColor ? { color: accentColor } : {}}>#{number}</strong>
          {onSafetyNoticeOpen && <VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={number} accentColor={accentColor} onOpen={onSafetyNoticeOpen} />}
          {(onRemove || !canRemove) && (
            <button
              type="button"
              onClick={canRemove ? onRemove : undefined}
              disabled={!canRemove}
              className={!canRemove ? "is-permission-locked" : undefined}
              aria-label={canRemove ? `ลบรถหมายเลข ${number}` : "ไม่มีสิทธิ์ลบรถ"}
              title={canRemove ? "ลบรถ" : "Role_ID นี้ไม่มีสิทธิ์ลบรถ"}
            >
              {canRemove ? <X size={18} strokeWidth={2} /> : <LockKeyhole size={16} strokeWidth={2} />}
            </button>
          )}
        </div>
        <span className="vehicle-cc-badge">{cc}</span>
      </div>
      {(!compact || displayManagers.length > 0) ? (
        <div className="vehicle-manager-list" aria-label={`ผู้ดูแลรถหมายเลข ${number}`}>
          {(compact ? displayManagers : visibleManagers).map((name, index) => (
            <span
              className={`vehicle-manager-slot ${displayManagers.length === 0 ? "is-empty" : ""}`}
              key={`${name}-${index}`}
            >
              {name}
            </span>
          ))}
        </div>
      ) : null}
      {(status === "inUse" || status === "active") ? (
        <div className="vehicle-session-meta" aria-label={`ข้อมูล Session ของรถหมายเลข ${number}`}>
          <span><b>Session_ID</b> {sessionId ?? "ยังไม่ระบุ"}</span>
          <span><b>ผู้ปฏิบัติงาน</b> {activeStaff.length ? activeStaff.map((name, index) => `${name}${activeRoles[index] ? ` (${activeRoles[index]})` : ""}`).join(" · ") : "ยังไม่ระบุ"}</span>
        </div>
      ) : null}
    </article>
  );
}
