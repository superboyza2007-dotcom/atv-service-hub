import React, { useState, type ReactNode } from "react";
import { ArrowLeft, UsersRound } from "lucide-react";
import { VehicleSafetyNoticeIndicator, VehicleSafetyNoticeList } from "@/components/VehicleSafetyNotice";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { formatGroupManagerNames } from "@/lib/vehicle-manager-resolver";
import { getResponsibilityGroupColor, type VehicleResponsibilityState } from "@/lib/vehicle-responsibility-store";
import { resolveSupervisorOperationalStatus, type SupervisorUserDirectoryStatusModel } from "@/lib/supervisor-data";

type GroupVehicle = { id?: string | number; number: string | number; cc: "200" | "250"; status: "ready" | "repair" | "inspection" | "pickup" | "active" };
type DirectoryUser = { id: string | number; name: string; role?: string; group?: string };
type StatusKey = "ready" | "repair" | "inspection" | "pickup" | "active" | "total";

type VehicleResponsibilityGroupViewProps = {
  vehicles: GroupVehicle[];
  responsibilityState: VehicleResponsibilityState;
  directoryUsers: DirectoryUser[];
  safetyNotices: VehicleSafetyNotice[];
  titleKicker?: string;
  chrome?: ReactNode;
  notice?: string;
  onBack: () => void;
  onSafetyNoticeOpen: (notices: VehicleSafetyNotice[]) => void;
  canReceivePickup?: (vehicle: GroupVehicle) => boolean;
  onReceivePickup?: (vehicle: GroupVehicle) => void;
  /** Canonical Supervisor User Directory status model for Mechanic/Supervisor doors. */
  statusModel?: SupervisorUserDirectoryStatusModel;
};

const statusLabels: Record<StatusKey, string> = { ready: "พร้อมใช้", repair: "ซ่อม", inspection: "คำแนะนำ", pickup: "แจ้งรับรถ", active: "กำลังใช้งาน", total: "รวมทั้งหมด" };

export function VehicleResponsibilityGroupView({ vehicles, responsibilityState, directoryUsers, safetyNotices, titleKicker = "VEHICLE RESPONSIBILITY / GROUP VIEW", chrome, notice, onBack, onSafetyNoticeOpen, canReceivePickup, onReceivePickup, statusModel }: VehicleResponsibilityGroupViewProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string | number>();
  const [selectedStatus, setSelectedStatus] = useState<StatusKey>("total");
  const [selectedCc, setSelectedCc] = useState<"200" | "250">();

  const openStatus = (groupId: string | number, cc: "200" | "250", status: StatusKey) => {
    setSelectedGroupId(groupId);
    setSelectedCc(cc);
    setSelectedStatus(status);
  };
  const backToGroups = () => {
    setSelectedGroupId(undefined);
    setSelectedCc(undefined);
    setSelectedStatus("total");
  };
  const statusNumbers = statusModel?.numbers;
  const numberMatchesStatus = (number: number, vehicle: GroupVehicle, status: StatusKey) => {
    if (status === "total") return true;
    if (status === "inspection") return statusNumbers ? statusNumbers.inspection.has(number) : safetyNotices.some(noticeItem => noticeItem.vehicleNumber === number);
    return statusNumbers ? statusNumbers[status].has(number) : vehicle.status === status;
  };
  const operationalStatusForVehicle = (number: number, vehicle: GroupVehicle) => statusNumbers ? resolveSupervisorOperationalStatus(number, statusNumbers) : vehicle.status;
  const countStatusForVehicles = (scopedVehicles: GroupVehicle[], status: StatusKey) => scopedVehicles.filter(vehicle => numberMatchesStatus(Number(vehicle.number), vehicle, status)).length;

  if (selectedGroupId !== undefined) {
    const selectedGroup = responsibilityState.responsibilityGroups.find(group => group.id === selectedGroupId);
    const groupVehicles = selectedGroup ? vehicles.filter(vehicle => selectedGroup.vehicleNumbers.includes(Number(vehicle.number))) : [];
    const scopedGroupVehicles = selectedCc ? groupVehicles.filter(vehicle => vehicle.cc === selectedCc) : groupVehicles;
    const listedVehicles = scopedGroupVehicles.filter(vehicle => numberMatchesStatus(Number(vehicle.number), vehicle, selectedStatus));
    const title = selectedStatus === "total" ? "รถทั้งหมด" : selectedStatus === "ready" ? "รถพร้อมใช้" : selectedStatus === "repair" ? "รถที่กำลังซ่อม" : selectedStatus === "inspection" ? "คำแนะนำจากช่าง" : selectedStatus === "pickup" ? "รถที่แจ้งรับรถ" : "รถที่กำลังใช้งาน";
    const scopedNotices = selectedGroup
      ? safetyNotices.filter(item => selectedGroup.vehicleNumbers.includes(item.vehicleNumber) && (!selectedCc || vehicles.some(vehicle => vehicle.cc === selectedCc && Number(vehicle.number) === item.vehicleNumber)))
      : [];

    return <main className="m3-shell">
      {chrome}
      <button className="m3-back" onClick={backToGroups}><ArrowLeft size={16} /> กลับหน้ากลุ่มรถ</button>
      <section className="m3-panel m3-status-detail-panel">
        <div className="m3-panel-title"><div><p>VEHICLE STATUS / {selectedGroup?.name || `GROUP ${selectedGroupId}`}</p><h2>{title}</h2><span>{selectedGroup ? `${selectedGroup.name || `กลุ่ม ${selectedGroup.id}`} · ${selectedCc ? `${selectedCc} ซีซี · ` : ""}${listedVehicles.length} คัน` : "ไม่พบกลุ่มรถ"}</span></div><span>{selectedStatus.toUpperCase()}</span></div>
        <div className="m3-status-detail-list">
          {listedVehicles.length ? listedVehicles.map(vehicle => {
            const number = Number(vehicle.number);
            const vehicleNotices = safetyNotices.filter(item => item.vehicleNumber === number);
            const color = getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups);
            const operationalStatus = operationalStatusForVehicle(number, vehicle);
            return <div className={`m3-status-detail-row ${operationalStatus}`} key={vehicle.id ?? `${selectedGroupId}-${number}`}>
              <span className="m3-status-vehicle-number"><b style={{ color }} className="m3-colored-vehicle-number">#{number}</b><VehicleSafetyNoticeIndicator notices={vehicleNotices} vehicleNumber={number} accentColor={color} onOpen={onSafetyNoticeOpen} /></span>
              <span>{vehicle.cc} ซีซี</span>
              <small>{selectedGroup?.name || "ไม่มีกลุ่ม"} · {selectedGroup ? formatGroupManagerNames(selectedGroup, directoryUsers, [], "ยังไม่มีผู้รับผิดชอบ") : "ยังไม่มีผู้รับผิดชอบ"}</small>
              <strong>{selectedStatus === "inspection" ? "มีคำแนะนำจากช่าง" : statusLabels[operationalStatus]}</strong>
              {selectedStatus === "inspection" && <button type="button" className="m3-receive-vehicle" onClick={() => onSafetyNoticeOpen(vehicleNotices)}>ดูคำแนะนำ</button>}
              {selectedStatus === "pickup" && onReceivePickup && <button type="button" className="m3-receive-vehicle" disabled={canReceivePickup ? !canReceivePickup(vehicle) : false} onClick={() => onReceivePickup(vehicle)}>รับรถเข้ากลุ่ม</button>}
            </div>;
          }) : <p className="m3-empty">ไม่มีรถในสถานะนี้ของกลุ่ม</p>}
        </div>
        <VehicleSafetyNoticeList notices={scopedNotices} vehicleNumbers={scopedGroupVehicles.map(vehicle => Number(vehicle.number))} onOpen={onSafetyNoticeOpen} />
        {notice && <p className="m3-notice">{notice}</p>}
      </section>
    </main>;
  }

  return <main className="m3-shell">
    {chrome}
    <button className="m3-back" onClick={onBack}><ArrowLeft size={16} /> กลับ Dashboard</button>
    <section className="m3-panel m3-groups-panel">
      <div className="m3-panel-title"><div><p>{titleKicker}</p><h2>กลุ่มรถในความดูแล</h2><span>แสดงตามกลุ่มผู้ดูแลจากฐานข้อมูลระบบ</span></div><UsersRound size={22} /></div>
      <div className="m3-group-list">
        {responsibilityState.responsibilityGroups.map(group => {
          const groupVehicles = vehicles.filter(vehicle => group.vehicleNumbers.includes(Number(vehicle.number)));
          const managers = formatGroupManagerNames(group, directoryUsers, [], "ยังไม่มีผู้รับผิดชอบ");
          return <article className="m3-responsibility-group" key={group.id} style={{ borderColor: group.color || "#81e597" }}>
            <div className="m3-group-header"><div><p>RESPONSIBILITY GROUP / {group.name || `กลุ่ม ${group.id}`}</p><h3>{group.name || `กลุ่ม ${group.id}`}</h3></div><span>จำนวนรถในฝูง {groupVehicles.length} คัน</span></div>
            <div className="m3-manager-line"><UsersRound size={14} /><strong>ผู้รับผิดชอบ: {managers}</strong></div>
            <div className="m3-group-cc-grid">
              {(["200", "250"] as const).map(cc => {
                const groupVehiclesByCc = groupVehicles.filter(vehicle => vehicle.cc === cc);
                const summary = {
                  ready: countStatusForVehicles(groupVehiclesByCc, "ready"),
                  repair: countStatusForVehicles(groupVehiclesByCc, "repair"),
                  inspection: countStatusForVehicles(groupVehiclesByCc, "inspection"),
                  pickup: countStatusForVehicles(groupVehiclesByCc, "pickup"),
                  active: countStatusForVehicles(groupVehiclesByCc, "active"),
                  total: countStatusForVehicles(groupVehiclesByCc, "total"),
                };
                return <div className="m3-group-cc" key={cc}><h4>{cc} ซีซี</h4><div className="m3-cc-metrics">{(["ready", "repair", "inspection", "pickup", "active", "total"] as const).map(status => <button type="button" className={status} key={status} onClick={() => openStatus(group.id, cc, status)}><b>{summary[status]}</b><span>{statusLabels[status]}</span></button>)}</div><div className="m3-group-vehicle-numbers"><span>รถในกลุ่ม:</span>{groupVehiclesByCc.length ? groupVehiclesByCc.map(vehicle => { const number = Number(vehicle.number); const vehicleNotices = safetyNotices.filter(item => item.vehicleNumber === number); const color = getResponsibilityGroupColor(number, responsibilityState.responsibilityGroups); return <span className="m3-group-vehicle-number" key={vehicle.id ?? `${group.id}-${number}`}><b style={{ color }}>#{number}</b><VehicleSafetyNoticeIndicator notices={vehicleNotices} vehicleNumber={number} accentColor={color} onOpen={onSafetyNoticeOpen} /></span>; }) : <span>ไม่มีรถในกลุ่ม</span>}</div></div>;
              })}
            </div>
          </article>;
        })}
      </div>
      {!responsibilityState.responsibilityGroups.length && <div className="m3-empty">ยังไม่มีกลุ่มผู้ดูแลรถในฐานข้อมูล</div>}
    </section>
  </main>;
}
