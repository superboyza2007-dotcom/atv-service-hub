import { useState } from "react";
import { Clock3, Save, Send, Settings2 } from "lucide-react";

type GoogleSheetsPendingSettingsProps = {
  moduleName: "Guide" | "Supervisor";
  historyLabel: string;
  ownerName?: string;
  personalUrl?: boolean;
};

/** UI placeholder only: this component intentionally has no persistence or network integration. */
export default function GoogleSheetsPendingSettings({ moduleName, historyLabel, ownerName, personalUrl = false }: GoogleSheetsPendingSettingsProps) {
  const [urlDraft, setUrlDraft] = useState("");
  const ownerLabel = personalUrl ? (ownerName?.trim() || "ผู้ใช้ที่เข้าสู่ระบบ") : "ส่วนกลางของโมดูล";

  return <div className="mechanic-settings-card mechanic-sheet-settings-card">
    <div className="mechanic-settings-card-heading">
      <div>
        <h4>เตรียมส่ง{historyLabel}ไป Google Sheets</h4>
        <p>เตรียมหน้าตั้งค่าโมดูล {moduleName} ไว้ก่อน ยังไม่ได้เชื่อมต่อการส่งข้อมูลหรือบันทึก URL จนกว่าจะกำหนดข้อมูลประวัติที่จะส่ง</p>
      </div>
      <Settings2 size={18} />
    </div>
    <div className="mechanic-sheet-settings-form">
      <label>{personalUrl ? `URL Google Sheets ส่วนตัว · ${ownerLabel}` : "URL Google Sheets ของโมดูลหัวหน้า"}
        <input type="url" value={urlDraft} onChange={event => setUrlDraft(event.target.value)} placeholder="https://script.google.com/macros/s/.../exec" autoComplete="off" />
      </label>
      <small>{personalUrl ? "ตั้งใจให้ URL แยกตามผู้ใช้ไกด์แต่ละคน; ช่องนี้ยังเก็บไว้เฉพาะบนหน้าจอและยังไม่ได้บันทึก" : "ช่องนี้เตรียมไว้สำหรับ URL ของโมดูลหัวหน้า; ยังไม่มีการส่งข้อมูลออก"}</small>
      <div className="mechanic-settings-add">
        <button type="button" className="m3-primary" disabled><Save size={14} /> บันทึก URL · รอเชื่อมต่อ</button>
        <button type="button" className="m3-secondary" disabled><Send size={14} /> ส่งข้อมูลตอนนี้ · รอเลือกประวัติ</button>
      </div>
      <div className="mechanic-sheet-schedule-placeholder"><Clock3 size={15} /><span>ส่งอัตโนมัติทุกวัน 20:00 น. เวลาไทย</span><b>รอเลือกข้อมูลและเชื่อมต่อ</b></div>
    </div>
  </div>;
}
