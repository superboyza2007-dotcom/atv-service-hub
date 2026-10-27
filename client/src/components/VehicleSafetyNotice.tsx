import React from "react";
import { AlertTriangle, X } from "lucide-react";
import { groupVehicleSafetyNotices, noticesForVehicle, type VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";

type VehicleSafetyNoticeIndicatorProps = {
  notices: VehicleSafetyNotice[];
  vehicleNumber: number;
  accentColor?: string;
  onOpen: (notices: VehicleSafetyNotice[]) => void;
  inline?: boolean;
};

export function VehicleSafetyNoticeIndicator({ notices, vehicleNumber, accentColor, onOpen, inline = false }: VehicleSafetyNoticeIndicatorProps) {
  const vehicleNotices = noticesForVehicle(notices, vehicleNumber);
  if (!vehicleNotices.length) return null;
  const label = `เปิดคำแนะนำจากช่างของรถหมายเลข ${vehicleNumber} ${vehicleNotices.length} รายการ`;
  const content = <><AlertTriangle size={11} strokeWidth={2.8} aria-hidden="true" /><b>!</b>{vehicleNotices.length > 1 && <small>{vehicleNotices.length}</small>}</>;
  const handleOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    onOpen(vehicleNotices);
  };
  if (inline) return <span role="button" tabIndex={0} className="vehicle-safety-indicator" style={accentColor ? { "--safety-accent": accentColor } as React.CSSProperties : undefined} aria-label={label} title={label} onClick={handleOpen} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); handleOpen(event as unknown as React.MouseEvent<HTMLElement>); } }}>{content}</span>;
  return <button type="button" className="vehicle-safety-indicator" style={accentColor ? { "--safety-accent": accentColor } as React.CSSProperties : undefined} aria-label={label} title={label} onClick={handleOpen}>{content}</button>;
}

type VehicleSafetyNoticeListProps = {
  notices: VehicleSafetyNotice[];
  vehicleNumbers: number[];
  onOpen: (notices: VehicleSafetyNotice[]) => void;
};

export function VehicleSafetyNoticeList({ notices, vehicleNumbers, onOpen }: VehicleSafetyNoticeListProps) {
  const groups = groupVehicleSafetyNotices(notices, vehicleNumbers);

  return (
    <section className="vehicle-safety-inline-list" aria-labelledby="vehicle-safety-inline-list-title">
      <div className="vehicle-safety-inline-list-heading">
        <div>
          <p>MECHANIC / SAFETY GUIDANCE</p>
          <h3 id="vehicle-safety-inline-list-title">คำแนะนำจากช่างในรายการ</h3>
        </div>
        <span>{groups.reduce((total, group) => total + group.notices.length, 0)} รายการ</span>
      </div>
      {groups.length ? <div className="vehicle-safety-inline-items">{groups.map(group => (
        <div className="vehicle-safety-inline-group" key={group.vehicleNumber}>
          <div className="vehicle-safety-inline-vehicle"><strong>รถ #{group.vehicleNumber}</strong><span>{group.notices.length} คำแนะนำ</span></div>
          {group.notices.map(notice => <button type="button" className={`vehicle-safety-inline-item ${notice.severity === "เร่งด่วน" ? "urgent" : "normal"}`} key={notice.id} onClick={() => onOpen(group.notices)}>
            <span className="vehicle-safety-inline-item-topline"><b>{notice.severity === "เร่งด่วน" ? "เร่งด่วน" : "คำแนะนำ"}</b>{notice.source === "waiting-available" && <small className="vehicle-safety-waiting-label">รออะไหล่</small>}<small>{notice.reporter} · {new Date(notice.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</small></span>
            <span>{notice.description}</span>
          </button>)}
        </div>
      ))}</div> : <p className="vehicle-safety-inline-empty">ยังไม่มีคำแนะนำจากช่างสำหรับรถในรายการนี้</p>}
    </section>
  );
}

type VehicleSafetyNoticeDialogProps = {
  notices: VehicleSafetyNotice[];
  onClose: () => void;
};

export function VehicleSafetyNoticeDialog({ notices, onClose }: VehicleSafetyNoticeDialogProps) {
  if (!notices.length) return null;
  const vehicleNumber = notices[0].vehicleNumber;
  return (
    <div className="vehicle-safety-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="vehicle-safety-dialog" role="dialog" aria-modal="true" aria-labelledby="vehicle-safety-dialog-title" onClick={event => event.stopPropagation()}>
        <header className="vehicle-safety-dialog-heading">
          <div>
            <p>MECHANIC / SAFETY GUIDANCE</p>
            <h2 id="vehicle-safety-dialog-title">คำแนะนำจากช่าง · รถ #{vehicleNumber}</h2>
            <span>กดเครื่องหมาย “!” เพื่อเปิดรายการนี้ได้ทุกโมดูล</span>
          </div>
          <button type="button" className="vehicle-safety-dialog-close" onClick={onClose} aria-label="ปิดคำแนะนำ"><X size={17} /></button>
        </header>
        <div className="vehicle-safety-dialog-list">
          {notices.map(notice => (
            <article key={notice.id} className={notice.severity === "เร่งด่วน" ? "urgent" : "normal"}>
              <div><strong>{notice.severity === "เร่งด่วน" ? "เร่งด่วน" : "คำแนะนำ"}</strong>{notice.source === "waiting-available" && <small className="vehicle-safety-waiting-label">รออะไหล่</small>}<small>{notice.reporter} · {new Date(notice.createdAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</small></div>
              <p>{notice.description}</p>
            </article>
          ))}
        </div>
        <small className="vehicle-safety-dialog-note">คำแนะนำนี้เป็นข้อมูลจากช่างและไม่เปลี่ยนสถานะรถโดยอัตโนมัติ</small>
      </section>
    </div>
  );
}
