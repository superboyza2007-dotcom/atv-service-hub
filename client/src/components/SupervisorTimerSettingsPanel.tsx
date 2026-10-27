import { useEffect, useState } from "react";
import { Check, Clock3, Settings2 } from "lucide-react";
import { DEFAULT_SUPERVISOR_TIMER_SETTINGS, type SupervisorTimerSettings } from "@shared/supervisor-timer-settings";
import { trpc } from "@/lib/trpc";

export default function SupervisorTimerSettingsPanel() {
  const utils = trpc.useUtils();
  const settingsQuery = trpc.supervisorTimerSettings.get.useQuery();
  const updateSettings = trpc.supervisorTimerSettings.update.useMutation({
    onSuccess: async settings => {
      setDraft(settings);
      setSaveMessage("บันทึกการตั้งค่าแล้ว รายการที่เริ่มไปแล้วจะไม่เปลี่ยนตาม");
      await utils.supervisorTimerSettings.get.invalidate();
    },
    onError: error => setSaveMessage(error.message || "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง"),
  });
  const [draft, setDraft] = useState<SupervisorTimerSettings>(DEFAULT_SUPERVISOR_TIMER_SETTINGS);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    if (settingsQuery.data) setDraft(settingsQuery.data);
  }, [settingsQuery.data]);

  const save = () => {
    setSaveMessage("");
    updateSettings.mutate(draft);
  };

  return <section className="speech-settings-card supervisor-timer-settings" aria-label="ตั้งค่าเวลาโปรแกรม Active">
    <div className="speech-settings-heading">
      <div><p>SUPERVISOR / ACTIVE TIMER</p><h3>เวลาโปรแกรม Active</h3><span>ตั้งค่านี้มีผลกับรายการที่เริ่ม Active หลังบันทึกเท่านั้น ไม่เปลี่ยนรายการที่กำลังทำอยู่</span></div>
      <Settings2 size={24} aria-hidden="true" />
    </div>
    {settingsQuery.isLoading ? <p className="supervisor-timer-settings-note">กำลังโหลดการตั้งค่า…</p> : settingsQuery.isError ? <p className="supervisor-timer-settings-error" role="alert">โหลดการตั้งค่าไม่สำเร็จ: {settingsQuery.error.message}</p> : <>
      <label className="speech-settings-toggle">
        <span><strong>{draft.enabled ? "เปิดตัวจับเวลา" : "ปิดตัวจับเวลา"}</strong><small>เมื่อปิด รายการใหม่จะไม่มีนับถอยหลังและจะไม่จบอัตโนมัติ แต่ยังจบด้วยมือได้</small></span>
        <input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} />
        <i aria-hidden="true" />
      </label>
      <div className={`supervisor-timer-settings-options ${draft.enabled ? "" : "is-disabled"}`}>
        <fieldset disabled={!draft.enabled}>
          <legend>เวลาเริ่มต้นของรายการใหม่</legend>
          <div className="supervisor-timer-choice-row" role="group" aria-label="เวลาเริ่มต้น">
            {[30, 60].map(minutes => <button key={minutes} type="button" className={draft.defaultDurationMinutes === minutes ? "selected" : ""} aria-pressed={draft.defaultDurationMinutes === minutes} onClick={() => setDraft(current => ({ ...current, defaultDurationMinutes: minutes as 30 | 60 }))}><strong>{minutes}</strong><span>นาที</span></button>)}
          </div>
          <legend className="supervisor-timer-expiry-legend">เมื่อครบเวลา</legend>
          <div className="supervisor-timer-policy-options">
            <label className={draft.expiryBehavior === "auto_complete" ? "selected" : ""}>
              <input type="radio" name="active-expiry-behavior" checked={draft.expiryBehavior === "auto_complete"} onChange={() => setDraft(current => ({ ...current, expiryBehavior: "auto_complete" }))} />
              <span><strong>จบรายการอัตโนมัติ</strong><small>ระบบจะจบรายการและคืนรถ แม้ปิดหน้าเว็บ</small></span>
            </label>
            <label className={draft.expiryBehavior === "overtime" ? "selected" : ""}>
              <input type="radio" name="active-expiry-behavior" checked={draft.expiryBehavior === "overtime"} onChange={() => setDraft(current => ({ ...current, expiryBehavior: "overtime" }))} />
              <span><strong>นับเวลาเกินต่อ</strong><small>รายการยัง Active และแสดงเวลาบวกจนกว่าจะจบด้วยมือ</small></span>
            </label>
          </div>
        </fieldset>
      </div>
      <div className="speech-settings-actions">
        <button type="button" className="m3-primary" onClick={save} disabled={updateSettings.isPending || settingsQuery.isLoading}><Check size={15} />{updateSettings.isPending ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</button>
        <span><Clock3 size={13} /> ค่าใหม่จะถูกบันทึกส่วนกลางและใช้กับรายการที่เริ่มหลังจากนี้</span>
      </div>
      {saveMessage && <p className={updateSettings.isError ? "supervisor-timer-settings-error" : "supervisor-timer-settings-note"} role="status">{saveMessage}</p>}
    </>}
  </section>;
}
