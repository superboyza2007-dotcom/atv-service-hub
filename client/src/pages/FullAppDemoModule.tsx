import { ArrowRight, CarFront, ClipboardCheck, Gauge, UsersRound } from "lucide-react";
import { FULL_APP_DEMO_USERS, FULL_APP_DEMO_VEHICLES } from "@/lib/full-app-demo";

const previewHref = (module: "guide" | "supervisor" | "mechanic", extra = "") => `?demo=full-app&module=${module}${extra}`;

export default function FullAppDemoModule() {
  return <main className="m3-shell full-app-demo-shell">
    <header className="m3-panel full-app-demo-hero">
      <div>
        <p>ATV OPERATIONS / TEST CENTER</p>
        <h1>โมดูลทดสอบทั้งแอป</h1>
        <span>พื้นที่จำลองการไหลของข้อมูลร่วมกันระหว่าง Guide, Supervisor และ Mechanic</span>
      </div>
      <Gauge size={38} aria-hidden="true" />
    </header>

    <section className="full-app-demo-summary" aria-label="สรุปข้อมูลจำลอง">
      <div><UsersRound size={19} /><strong>{FULL_APP_DEMO_USERS.length}</strong><span>ผู้ใช้จำลอง</span></div>
      <div><CarFront size={19} /><strong>{FULL_APP_DEMO_VEHICLES.length}</strong><span>รถจำลอง</span></div>
      <div><ClipboardCheck size={19} /><strong>3</strong><span>โมดูลเชื่อมกัน</span></div>
    </section>

    <section className="full-app-demo-module-grid">
      <a className="full-app-demo-module-card guide" href={previewHref("guide")}>
        <div><p>MODULE 01</p><h2>Guide</h2><span>ทดสอบรายชื่อ คิว 2.1 การเลือกรถ และการแจ้งซ่อม</span></div><ArrowRight size={22} />
      </a>
      <a className="full-app-demo-module-card supervisor" href={previewHref("supervisor", "&tab=database")}>
        <div><p>MODULE 02</p><h2>Supervisor</h2><span>ตรวจผู้ใช้ 7 คน รถ 7 คัน กลุ่มผู้รับผิดชอบ และสถานะรวม</span></div><ArrowRight size={22} />
      </a>
      <a className="full-app-demo-module-card mechanic" href={previewHref("mechanic", "&tab=repairBoard")}>
        <div><p>MODULE 03</p><h2>Mechanic</h2><span>ทดสอบบอร์ดซ่อม รายการรออะไหล่ และการเปลี่ยนสถานะ</span></div><ArrowRight size={22} />
      </a>
    </section>

    <section className="m3-panel full-app-demo-note">
      <strong>วิธีทดสอบ</strong>
      <p>เริ่มจาก Guide เพื่อเลือกผู้ใช้และรถ จากนั้นเปิด Supervisor ตรวจข้อมูลรวม แล้วเข้า Mechanic เพื่อทดสอบ workflow งานซ่อม ข้อมูลชุดนี้เป็น Demo แยกจากข้อมูลจริงและไม่เขียนทับ Backend production</p>
    </section>
  </main>;
}
