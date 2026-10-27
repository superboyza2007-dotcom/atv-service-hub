import { Volume2, VolumeX } from "lucide-react";
import { useSpeechSettings } from "@/contexts/SpeechSettingsContext";

type SpeechSettingsPanelProps = { moduleName: string };

export default function SpeechSettingsPanel({ moduleName }: SpeechSettingsPanelProps) {
  const { thaiSpeechEnabled, setThaiSpeechEnabled, speakThai, speechSupported } = useSpeechSettings();

  return <section className="speech-settings-card" aria-label="ตั้งค่าอ่านออกเสียงภาษาไทย">
    <div className="speech-settings-heading">
      <div><p>ACCESSIBILITY / THAI VOICE</p><h3>อ่านออกเสียงภาษาไทย</h3><span>ตั้งค่านี้ใช้ร่วมกับ {moduleName} ตลอด session การใช้งานนี้</span></div>
      {thaiSpeechEnabled ? <Volume2 size={24} /> : <VolumeX size={24} />}
    </div>
    <label className="speech-settings-toggle">
      <span><strong>{thaiSpeechEnabled ? "เปิดใช้งาน" : "ปิดใช้งาน"}</strong><small>เมื่อเปิดแล้ว ข้อความที่ผูกกับระบบอ่านออกเสียงจะอ่านเป็นภาษาไทย</small></span>
      <input type="checkbox" checked={thaiSpeechEnabled} onChange={event => setThaiSpeechEnabled(event.target.checked)} />
      <i aria-hidden="true" />
    </label>
    <div className="speech-settings-actions">
      <button type="button" className="m3-secondary" disabled={!thaiSpeechEnabled || !speechSupported} onClick={() => speakThai("เปิดใช้งานการอ่านออกเสียงภาษาไทยแล้ว")}>{speechSupported ? "ทดลองอ่านเสียง" : "อุปกรณ์นี้ไม่รองรับเสียงอ่าน"}</button>
      <span>{speechSupported ? "กดครั้งเดียวที่ข้อความที่รองรับเพื่อฟังเสียงได้" : "กรุณาใช้เบราว์เซอร์ที่รองรับ Text-to-Speech"}</span>
    </div>
  </section>;
}
