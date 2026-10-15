import React, { useMemo, useState } from "react";
import { ArrowLeft, CalendarClock, Check, Plus, Search } from "lucide-react";
import { isSelectableForNewSession, isVehicleOperationallyReadyStatus } from "@/lib/vehicle-selection-rules";
import { VehicleSafetyNoticeIndicator } from "@/components/VehicleSafetyNotice";
import type { VehicleSafetyNotice } from "@/lib/vehicle-safety-notices";
import { memberGroupClass } from "@/lib/member-group-style";

export type SessionCreatorVehicle = { number: number; cc: "200" | "250"; status: string; group?: string; manager?: string; color?: string };
export type SessionCreatorMember = { id: string; name: string; role?: string; available?: boolean };
export type SessionCreatorDraft = { vehicleIds: string[]; memberIds: string[]; activeUserId: string; durationMinutes: number; riderCount: number; passengerCount: number };

type Props = { vehicles: SessionCreatorVehicle[]; members: SessionCreatorMember[]; busyVehicleNumbers: Set<number>; busyMemberIds?: Set<string>; creatorName: string; onBack: () => void; onCreate: (draft: SessionCreatorDraft) => void; roleLabel?: string; activeUserId?: string; activeUserName?: string; lockActiveUser?: boolean; safetyNotices?: VehicleSafetyNotice[]; onSafetyNoticeOpen?: (notices: VehicleSafetyNotice[]) => void };

export function SessionCreatorForm({ vehicles, members, busyVehicleNumbers, busyMemberIds = new Set<string>(), creatorName, onBack, onCreate, roleLabel = "Guide / Mechanic", activeUserId: initialActiveUserId = "", activeUserName = creatorName, lockActiveUser = false, safetyNotices = [], onSafetyNoticeOpen }: Props) {
  const [vehicleNumbers, setVehicleNumbers] = useState<number[]>([]);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [activeUserId, setActiveUserId] = useState(initialActiveUserId);
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [riderCount, setRiderCount] = useState(1);
  const [passengerCount, setPassengerCount] = useState(0);
  const [memberSearch, setMemberSearch] = useState("");
  const [error, setError] = useState("");
  const selectableVehicles = useMemo(() => vehicles.filter(vehicle => isSelectableForNewSession(vehicle, busyVehicleNumbers, vehicle.number)), [vehicles, busyVehicleNumbers]);
  const inputVehicleGroups = useMemo(() => {
    const groups = new Map<string, { label: string; color: string; vehicles: SessionCreatorVehicle[] }>();
    selectableVehicles.forEach(vehicle => {
      const label = vehicle.group || "ยังไม่มีกลุ่ม";
      const current = groups.get(label) ?? { label, color: vehicle.color || "#81e597", vehicles: [] };
      current.vehicles.push(vehicle);
      groups.set(label, current);
    });
    return Array.from(groups.values()).sort((left, right) => left.label.localeCompare(right.label, "th"));
  }, [selectableVehicles]);
  const toggleVehicle = (number: number) => setVehicleNumbers(current => current.includes(number) ? current.filter(item => item !== number) : [...current, number]);
  const toggleMember = (id: string) => { setMemberIds(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id]); if (activeUserId === id) setActiveUserId(""); };
  const submit = () => { if (!vehicleNumbers.length) return setError("กรุณาเลือกรถอย่างน้อย 1 คัน"); if (!memberIds.length) return setError("กรุณาเลือกผู้ปฏิบัติงานอย่างน้อย 1 คน"); if (!activeUserId || (!lockActiveUser && !memberIds.includes(activeUserId))) return setError(lockActiveUser ? "ไม่พบผู้ทำรายการจากบัญชีที่ล็อกอิน" : "กรุณาเลือกผู้ทำรายการจากผู้ปฏิบัติงานที่เลือกไว้"); setError(""); onCreate({ vehicleIds: vehicleNumbers.map(number => `m3-v${number}`), memberIds, activeUserId, durationMinutes, riderCount, passengerCount }); };
  return <main className="m3-shell">
    <button className="m3-back" onClick={onBack}><ArrowLeft size={16} /> กลับหน้าแรกหัวหน้า</button>
    <section className="m3-panel m3-input-panel supervisor-standby-creator">
      <div className="m3-panel-title"><div><p>2.1 / INPUT</p><h2>สร้างรายการใหม่</h2><span>ผู้สร้างห้อง: {creatorName} · หัวหน้าจะเป็นผู้ปฏิบัติงานก็ต่อเมื่อกดเลือกเอง</span></div><CalendarClock size={22} /></div>
      <div className="m3-input-settings-row">
        <div className="m3-field"><label>โปรแกรมเวลา</label><div className="m3-segment"><button type="button" className={durationMinutes === 30 ? "selected" : ""} onClick={() => setDurationMinutes(30)}>30 นาที</button><button type="button" className={durationMinutes === 60 ? "selected" : ""} onClick={() => setDurationMinutes(60)}>60 นาที</button></div></div>
        <div className="m3-counter-group"><label className="m3-counter-heading">ผู้ใช้บริการ</label><div className="m3-counter-row"><label>R <input type="number" min="0" value={riderCount} onChange={event => setRiderCount(Math.max(0, Number(event.target.value) || 0))} /></label><label>P <input type="number" min="0" value={passengerCount} onChange={event => setPassengerCount(Math.max(0, Number(event.target.value) || 0))} /></label></div></div>
      </div>
      <div className="m3-field"><label>รถพร้อมใช้เท่านั้น</label><div className="m3-input-vehicle-groups">{inputVehicleGroups.length ? inputVehicleGroups.map(group => <section className="m3-input-vehicle-group" key={group.label} style={{ "--input-group-accent": group.color } as React.CSSProperties}><div className="m3-input-vehicle-group-heading"><div><strong>{group.label}</strong><span>เบอร์รถในกลุ่ม · {group.vehicles.length} คัน</span></div><small>{group.vehicles.filter(vehicle => isVehicleOperationallyReadyStatus(vehicle.status)).length} คันว่าง</small></div><div className="m3-input-vehicle-group-numbers">{(["200", "250"] as const).map(cc => { const groupVehicles = group.vehicles.filter(vehicle => vehicle.cc === cc); return groupVehicles.length ? <div className="m3-input-vehicle-cc" key={cc}><div className="m3-input-vehicle-cc-heading"><strong>{cc} ซีซี</strong><span>{groupVehicles.length} เบอร์</span></div><div className="m3-lot-grid">{groupVehicles.sort((left, right) => left.number - right.number).map(vehicle => { const ready = isVehicleOperationallyReadyStatus(vehicle.status); const selected = vehicleNumbers.includes(vehicle.number); const accent = vehicle.color || "#4ee88a"; return <button type="button" key={vehicle.number} disabled={!ready} style={{ borderColor: selected ? "#87919b" : accent, color: accent, boxShadow: `0 0 14px ${accent}33` }} className={`${vehicle.status} ${selected ? "selected m3-selected-vehicle" : ""}`} onClick={() => toggleVehicle(vehicle.number)}><span className="m3-lot-number-wrap"><b>#{vehicle.number}</b><VehicleSafetyNoticeIndicator notices={safetyNotices} vehicleNumber={vehicle.number} accentColor={accent} onOpen={onSafetyNoticeOpen ?? (() => undefined)} inline /></span><small>{vehicle.status === "repair" ? "ซ่อม" : vehicle.status === "pickup" ? "แจ้งรับรถ" : vehicle.status === "active" ? "กำลังใช้งาน" : vehicle.status === "inspection" ? "พร้อมใช้ · มีคำแนะนำ" : safetyNotices.some(notice => notice.vehicleNumber === vehicle.number) ? "พร้อมใช้ · มีคำแนะนำ" : "พร้อมใช้"}</small><em style={{ color: accent }}>{vehicle.group || "ยังไม่มีกลุ่ม"}</em><em>{vehicle.manager || "ยังไม่ระบุผู้ดูแล"}</em></button>; })}</div></div> : null; })}</div></section>) : <p className="m3-empty">ยังไม่มีรถพร้อมใช้ในกลุ่ม</p>}</div></div>
      <div className="m3-field"><label>{roleLabel}</label><div className="m3-search"><Search size={15} /><input value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder="ค้นหาชื่อ" /></div><div className="m3-member-grid">{members.filter(member => member.name.includes(memberSearch)).map(member => { const busy = busyMemberIds.has(member.id) && !memberIds.includes(member.id); return <button type="button" key={member.id} disabled={busy} className={`${memberIds.includes(member.id) ? "selected" : ""} ${busy ? "busy" : ""}`} onClick={() => toggleMember(member.id)}><b className={memberGroupClass(member.role)}>{member.name}</b><small>{busy ? "อยู่ใน Standby หรือ Active" : member.role || "ผู้ปฏิบัติงาน"}</small></button>; })}</div></div>
      <div className="m3-field m3-active-user-field"><label>ผู้ทำรายการ / Active User</label>{lockActiveUser ? <div className="m3-locked-user" aria-live="polite"><strong>{activeUserName}</strong><span>ID {activeUserId} · ล็อกอินอยู่ · ระบบใส่ให้อัตโนมัติ</span></div> : <div className="m3-member-grid supervisor-actor-grid">{members.filter(member => memberIds.includes(member.id)).map(member => <button type="button" key={member.id} className={activeUserId === member.id ? "selected" : ""} onClick={() => setActiveUserId(member.id)}><b className={memberGroupClass(member.role)}>{member.name}</b><small>กดเลือกเป็นผู้ทำรายการ</small></button>)}{!memberIds.length && <p className="m3-empty">เลือกผู้ปฏิบัติงานก่อน</p>}</div>}<small>{lockActiveUser ? "ผู้ทำรายการจะเป็นหัวหน้าที่ล็อกอินด้วย ID นี้เสมอ และไม่ต้องเลือกซ้ำ" : "ต้องกดเลือกผู้ทำรายการจากผู้ปฏิบัติงานที่เลือกไว้เท่านั้น"}</small></div>
      {error && <p className="m3-form-error" role="alert">{error}</p>}
      <button type="button" className="m3-primary" onClick={submit}><Plus size={16} /> ส่งข้อมูล → 2.2 Standby</button><p className="m3-form-hint"><Check size={14} /> รายการจะถูกสร้างเป็น Standby และหัวหน้าจะถูกบันทึกเป็นผู้สร้างห้องแยกจากผู้ปฏิบัติงาน</p>
    </section>
  </main>;
}
