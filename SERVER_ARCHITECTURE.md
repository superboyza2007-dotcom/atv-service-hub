# ATV Service Hub — Server, API และ Data Flow

เอกสารนี้อธิบายโค้ดรุ่นปัจจุบันของ ATV Service Hub ณ commit `f2b96fb` โดยอ้างอิงจาก source code ใน repository ไม่ใช่คำอธิบายเชิงสมมติ เอกสารนี้ตั้งใจใช้เป็นคู่มือสำหรับดูแลระบบ ย้ายเซิร์ฟเวอร์ ตรวจปัญหา และพัฒนาต่อ

## 1. ภาพรวมระบบ

ATV Service Hub เป็นเว็บแอปแบบ full-stack ประกอบด้วย React ฝั่งผู้ใช้, Express เป็น HTTP server, tRPC เป็นชั้น API แบบ type-safe, Drizzle ORM เป็นชั้นเข้าถึงฐานข้อมูล และ MySQL เป็นฐานข้อมูลกลาง ระบบสร้างด้วย TypeScript และใช้ Vite สำหรับ build ฝั่งหน้าเว็บ

```text
ผู้ใช้มือถือ/เบราว์เซอร์
        │ HTTPS
        ▼
Express + Vite static serving
        │ /api/trpc
        ▼
tRPC Router (server/routers.ts)
        │
        ├── Authentication / App Directory Session
        ├── Vehicle Flow Service
        ├── Active Queue / 2.3 Bridge
        ├── Future Dice Service
        ├── Live Messages / Operational History
        ├── Operations Snapshots
        └── Google Apps Script RepairLog (ภายนอก)
        │
        ▼
Drizzle ORM → MySQL Managed Database
```

ระบบมี identity สองแบบที่อยู่ร่วมกัน:

1. **Manus OAuth identity** ใช้กับระบบผู้ใช้มาตรฐานของ starter และ `ctx.user` ใน server context
2. **App Directory code login** ใช้กับผู้ปฏิบัติงานในแอป ATV โดยผู้ใช้กรอกรหัสของตนเอง ระบบสร้าง session cookie ของแอปและอ่านผู้ใช้เป็น `ctx.appUser`

Endpoint ธุรกิจส่วนใหญ่ใช้ `appProtectedProcedure` ซึ่งอนุญาตเมื่อมีอย่างน้อยหนึ่งอย่าง: app-directory session, Manus OAuth session หรือ special access session

## 2. ประเภทเซิร์ฟเวอร์และการรัน

### 2.1 Development

คำสั่ง `pnpm dev` เรียก `tsx watch server/_core/index.ts` และใช้ `PORT` จาก environment หรือค่าเริ่มต้น `3000` เซิร์ฟเวอร์อ่านโค้ด TypeScript โดยตรงและ Vite ทำหน้าที่เสิร์ฟ/ประมวลผล frontend ระหว่างพัฒนา

### 2.2 Production

คำสั่ง `pnpm build` ทำสองส่วน:

- `vite build` สร้างไฟล์ frontend ไปที่ `dist/public`
- `esbuild server/_core/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist` bundle backend เป็น `dist/index.js`

คำสั่ง `pnpm start` เรียก `NODE_ENV=production node dist/index.js` เซิร์ฟเวอร์ production ต้อง listen บน `0.0.0.0` และเคารพ `PORT` โดยค่าเริ่มต้นคือ `3000`

### 2.3 Runtime ที่ใช้อยู่ในโปรเจกต์ Managed

โปรเจกต์ใช้ Managed Web server และ Managed MySQL database ของแพลตฟอร์ม การตั้งค่าหลักอยู่ที่ Webdev configuration ไม่ควร hard-code credential ใน source code ค่าเชื่อมต่อฐานข้อมูลถูกส่งผ่าน `DATABASE_URL` และอ่านแบบ lazy ใน `server/db.ts`

ไฟล์สำคัญ:

- `Dockerfile` — รูปแบบ image/runtime สำหรับ deploy
- `server/_core/index.ts` — จุดเริ่ม Express และ route ของ server
- `server/_core/context.ts` — สร้าง request context
- `server/_core/trpc.ts` — public/protected/admin procedure และ SuperJSON transformer
- `server/db.ts` — Drizzle MySQL connection และ database functions
- `drizzle.config.ts` — การตั้งค่า migration/schema
- `client/public/manus-routes.json` และ `public/manus-routes.json` — manifest ของหน้าเว็บ

## 3. HTTP และ API transport

Frontend เรียก backend ผ่าน tRPC client ที่กำหนดใน `client/src/lib/trpc` และใช้ `AppRouter` จาก `server/routers.ts` เป็น contract หลัก ข้อมูลถูก serialize ด้วย SuperJSON เพื่อรองรับ Date และชนิดข้อมูลที่ไม่ใช่ JSON primitive

API ธุรกิจทั้งหมดอยู่ใต้ router หลักดังนี้:

```text
system
 directory
 repairLog
 futureDice
 liveMessages
 operationalHistory
 activeBridge
 operationsSnapshots
 runQueue
 auth
 vehicleFlow
```

การตรวจสิทธิ์มีสามชั้น:

- `publicProcedure` — ใช้กับ login และข้อมูลที่ต้องอ่านได้ก่อน login ตามที่กำหนด
- `appProtectedProcedure` — ต้องมี app session, OAuth user หรือ special access
- `protectedProcedure` / `adminProcedure` — contract มาตรฐานของ Manus OAuth สำหรับ endpoint ที่ต้องใช้ `ctx.user`

## 4. API catalog แบบละเอียด

### 4.1 `directory`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `directory.list` | query | อ่านรายชื่อ app directory โดยส่งเฉพาะ id, name, group และ `hasCode` ไม่ส่งรหัสจริง |
| `directory.specialAuthenticate` | mutation | ตรวจ special access code แล้วสร้าง special directory session |
| `directory.authenticate` | mutation | ตรวจรหัสผู้ใช้กับ app directory สร้าง cookie session และคืนข้อมูลผู้ใช้ที่ปลอดภัย |
| `directory.me` | query | อ่านผู้ใช้ปัจจุบันจาก app session หรือ special session |
| `directory.heartbeat` | mutation | บันทึก last-seen presence ของผู้ใช้ปัจจุบัน |
| `directory.verifyCurrentCode` | mutation | ตรวจว่ารหัสที่กรอกตรงกับ session ปัจจุบันหรือ special code |
| `directory.sync` | mutation | Supervisor/สิทธิ์พิเศษแทนที่ directory ทั้งชุดแบบ canonical full list |

รหัส app directory รุ่นใหม่ถูกเก็บเป็น `codeHash` และ `codeSalt`; ค่า plaintext ไม่ควรถูกส่งกลับ client และการ sync จะคง hash เดิมเมื่อ client ไม่ได้ส่งรหัสใหม่ของผู้ใช้เดิม

### 4.2 `vehicleFlow`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `vehicleFlow.summary` | query | อ่านสถานะรถทั้งหมดพร้อมกลุ่มและขนาดเครื่อง |
| `vehicleFlow.activeQueue` | query | อ่าน session ที่กำลัง active และรถที่ถูกใช้ |
| `vehicleFlow.reconcileActiveQueue` | query | สร้าง snapshot ของ active queue และ reconcile event จาก source |
| `vehicleFlow.completeNextActiveQueue` | mutation | จบรายการ Active ลำดับแรกของ queue โดยยังตรวจสิทธิ์ใน service |
| `vehicleFlow.pickupNotifications` | query | อ่านแจ้งเตือนรับรถที่ยังไม่อ่านของผู้ใช้ |
| `vehicleFlow.reportRepair` | mutation | สร้าง repair job และเปลี่ยนรถเป็น `repair` |
| `vehicleFlow.markPickup` | mutation | ช่างปิดงานซ่อม เปลี่ยนรถเป็น `pickup` และแจ้ง guide ในกลุ่มรถ |
| `vehicleFlow.completeRepairWithoutPickup` | mutation | ปิดงานซ่อมและคืนรถเป็น `ready` โดยไม่ผ่าน pickup |
| `vehicleFlow.receivePickup` | mutation | Guide รับรถ เปลี่ยน `pickup` เป็น `ready` และ mark notification อ่านแล้ว |
| `vehicleFlow.createSession` | mutation | สร้าง session Standby หรือ Active พร้อมผูกรถ |
| `vehicleFlow.activateSession` | mutation | เปลี่ยน session จาก Standby เป็น Active |
| `vehicleFlow.completeSession` | mutation | จบ Active และคืนรถเป็น Ready |
| `vehicleFlow.cancelSession` | mutation | ยกเลิก Standby และคืนรถเป็น Ready |

ทุก mutation ใน vehicle flow ส่ง actor เข้า `vehicleFlowService` เพื่อบังคับ transition rule, group membership และ role ก่อนเปลี่ยนสถานะ

### 4.3 `futureDice`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `futureDice.invitation` | query | ตรวจว่าผู้ใช้มีเกมที่กำลังเล่นหรือรอผู้ชนะเลือกผลหรือไม่ |
| `futureDice.roster` | query | อ่านรายชื่อผู้เล่นและสถานะ online จาก heartbeat |
| `futureDice.list` | query | อ่านเกมย้อนหลัง/เกมปัจจุบันไม่เกิน limit ที่กำหนด |
| `futureDice.get` | query | อ่านเกมหนึ่งรายการพร้อมผู้เล่น ลูกเต๋า และคะแนนที่คำนวณจาก server |
| `futureDice.create` | mutation | สร้างเกม 1vs1 หรือ 2vs2 และ snapshot รายชื่อผู้เล่นลงเกม |
| `futureDice.roll` | mutation | ตรวจ turn/สิทธิ์ แล้วสุ่มลูกเต๋าฝั่ง server และบันทึก immutable roll |
| `futureDice.chooseOutcome` | mutation | ให้สมาชิกฝั่งผู้ชนะเลือกผลลัพธ์ และประกาศผลใน live room |
| `futureDice.setOutcomeType` | mutation | Supervisor เปลี่ยนประเภทผลลัพธ์ของเกมที่ยังเปิดอยู่ |
| `futureDice.cancel` | mutation | ยกเลิกเกมที่ยังเปิดหรือรอผลเลือกตามสิทธิ์ |

เกมทอยเต๋าเป็น server-authoritative: browser ไม่เป็นเจ้าของคะแนนหรือ random result การสุ่มใช้ `node:crypto.randomInt(1, 7)` ใน `futureDiceService.ts`

เมื่อผู้ชนะเลือกผล ระบบส่งข้อความไป room `future-dice` รูปแบบปัจจุบันเท่านั้น:

```text
ผู้ชนะ: <รายชื่อ> ได้ <คะแนน> แต้ม · ผู้แพ้: <รายชื่อ> ได้ <คะแนน> แต้ม · ผู้ชนะเลือก: <ผลลัพธ์>
```

ไม่มีชื่อ Team A/Team B ในประกาศผล และ `FutureDiceResultToast` แสดงข้อความนี้ 10 วินาที

### 4.4 `liveMessages`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `liveMessages.list` | query | อ่านข้อความของ channel แบบ `active` หรือ `room` |
| `liveMessages.send` | mutation | ส่งข้อความทั่วไปจาก guide/mechanic/supervisor |
| `liveMessages.clear` | mutation | Supervisor หรือสิทธิ์พิเศษล้าง live messages ทั้งชุด |

Live message เป็นข้อมูลชั่วคราว ไม่ใช่ audit history ระบบมี scheduled cleanup แยกต่างหาก

### 4.5 `operationalHistory`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `operationalHistory.list` | query | อ่านประวัติเหตุการณ์ถาวรตาม limit |
| `operationalHistory.record` | mutation | บันทึก event type, module, actor, session/vehicle และ JSON payload |

ข้อมูลในชุดนี้ไม่ถูกล้างพร้อม live messages

### 4.6 `activeBridge`

`activeBridge.snapshot` อ่าน snapshot แบบ read-only จาก Guide 2.3 Active โดยใช้ keys `atv-guide-sessions-v1` และ `atv-guide-state-v1` ใน `appOperationsSnapshots`

Bridge ทำหน้าที่:

1. อ่าน session ที่มี status `Active`
2. map member id เป็นชื่อจาก Guide state
3. แยก `Completed` เป็น `completedSessionIds`
4. สร้าง `eventId` จาก SHA-256 fingerprint
5. ส่งสัญญาแคบให้ Team Board โดยไม่ reorder, complete หรือ dispatch queue เอง

### 4.7 `operationsSnapshots`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `get` | query | อ่าน JSON payload ของ snapshot key |
| `save` | mutation | เขียน snapshot ทั้ง payload |
| `merge` | mutation | merge เฉพาะ field ที่ส่งมา และรักษาข้อมูล repair/chat ที่เป็น terminal ตามกฎใน db layer |
| `append` | mutation | append item เข้า array field พร้อม deduplicate ตาม id และจำกัดจำนวน |

Snapshot เหมาะกับ state ของโมดูลที่มี schema ฝั่ง client แต่ต้องแชร์ผ่าน server เช่น Guide state, Mechanic state, Fleet state และ queue state

### 4.8 `runQueue`

`runQueue.get` และ `runQueue.save` ใช้ key `atv-run-queue-v1` สำหรับ queue state ที่ Team Board ใช้ร่วมกัน การเปลี่ยน queue ต้องผ่าน engine/adapter ที่มีอยู่ ไม่ควรแก้ payload แบบสุ่มจาก client

### 4.9 `repairLog`

| Endpoint | ชนิด | หน้าที่ |
|---|---|---|
| `repairLog.status` | query | ตรวจว่า Google Apps Script endpoint ถูกตั้งค่าและผ่าน allowlist หรือไม่ |
| `repairLog.submit` | mutation | ตรวจ schema 13 columns แล้วส่ง repair log ไป Google Apps Script |

การเชื่อมต่อภายนอกยอมรับเฉพาะ HTTPS `script.google.com/macros/s/.../exec` และ redirect ที่ปลอดภัยไป `script.googleusercontent.com/macros/...` เท่านั้น มี timeout 15 วินาที และตรวจ response `{ ok: true }`

## 5. Backend service และส่วนคำนวณ

### 5.1 `vehicleFlowRules.ts`

เป็นกฎ pure function สำหรับอนุญาต transition ของรถ เช่น `ready`, `repair`, `pickup`, `active` โดยพิจารณา role และ membership ของผู้ปฏิบัติงาน การคำนวณส่วนนี้ทดสอบได้โดยไม่ต้องใช้ฐานข้อมูล

### 5.2 `vehicleFlowService.ts`

เป็น service หลักที่ทำ transaction เชิงธุรกิจ:

- อ่านรถพร้อม group context
- ตรวจ membership
- ตรวจและบันทึก transition
- insert `vehicleStatusHistory` ทุกครั้งที่เปลี่ยนสถานะ
- สร้าง/ปิด repair job
- สร้าง notification ให้ guide ในกลุ่มรถ
- ผูก vehicle กับ session
- คืนรถเมื่อจบหรือยกเลิก session

### 5.3 `activeQueueAdapter.ts` และ `activeQueueMirror.ts`

Adapter แปลง active session เป็น queue snapshot ที่ UI ใช้ได้ ส่วน mirror มีสองงานหลัก:

- reconcile source queue ให้เห็นรายการ Active ปัจจุบัน
- complete รายการแรกโดยเรียก `completeVehicleSession` ไม่ทำ bypass authorization

### 5.4 `activeSourceBridge.ts`

เป็น read-only bridge ระหว่าง Guide 2.3 Active กับ Team Board โดยใช้ operations snapshot เป็น source ไม่ใช่ฐานข้อมูล vehicle session โดยตรง จึงต้องรักษา source session id และ completed id เพื่อป้องกันรายการเก่ากลับมาเป็น Active

### 5.5 `futureDiceRules.ts`

เป็น pure calculation layer ของเกม:

- กำหนด slot/order สำหรับ 1vs1 และ 2vs2
- ตรวจจำนวนผู้เล่นและห้ามซ้ำ
- ตรวจว่า turn ปัจจุบันใครมีสิทธิ์ทอย
- อนุญาตสมาชิกทีมทอยแทนได้เมื่อผู้เล่นเป้าหมาย offline
- รวมแต้มลูกเต๋าต่อทีม
- ตรวจ complete/tie และเริ่มรอบตัดสินใหม่
- ตรวจว่าผู้เลือกผลเป็นสมาชิกทีมชนะ

### 5.6 `futureDiceService.ts`

เป็น persistence/service layer ของเกม ใช้ transaction ตอนสร้างเกมและตอนทอย ป้องกัน race condition ด้วยเงื่อนไข `currentRound` และ `currentTurn` ใน update ถ้ามีอุปกรณ์อื่นทอยไปก่อนจะคืน error แทนการเขียนทับ

### 5.7 `db.ts`

เป็น data-access layer รวม:

- lazy Drizzle connection
- directory users และ password hashing fields
- heartbeat/presence
- snapshots และ merge rules
- live messages
- operational history
- online user calculation

## 6. โครงสร้างฐานข้อมูล

### Identity และสิทธิ์

- `users` — Manus OAuth users
- `appDirectoryUsers` — ผู้ใช้รหัสของแอป
- `appDirectoryPresence` — last-seen ของผู้ใช้ app directory

### Fleet และงานซ่อม

- `vehicleGroups` — กลุ่มรถ
- `vehicleGroupMembers` — สิทธิ์ guide/mechanic ในกลุ่ม
- `vehicles` — source of truth ของรถและสถานะปัจจุบัน
- `repairJobs` — งานซ่อม
- `vehicleNotifications` — แจ้งเตือนรับรถ
- `vehicleStatusHistory` — audit ของ transition รถ

### Session รถ

- `vehicleSessions` — Standby/Active/Completed/Cancelled
- `vehicleSessionVehicles` — ตารางเชื่อม session กับรถ

### Future Dice

- `futureDiceSessions` — สถานะเกม ประเภทเกม รอบ turn ผู้ชนะและผลที่เลือก
- `futureDicePlayers` — snapshot รายชื่อ/slot/team ของเกม
- `futureDiceRolls` — ผลลูกเต๋าที่ server สุ่มและบันทึกแบบ immutable

### State และการสื่อสาร

- `appOperationsSnapshots` — JSON snapshots ที่แชร์ข้ามโมดูล
- `appOperationalHistory` — ประวัติถาวร
- `appLiveMessages` — chat/announcement ชั่วคราว
- `appMessageCleanupJobs` — metadata งาน cleanup live message
- `vehicleFlowSchedules` — metadata งาน reconcile session หมดอายุ

Migration ที่เกี่ยวข้องกับรุ่นปัจจุบันอยู่ใน `drizzle/0000_*.sql` ถึง `drizzle/0004_dice_mini_integration.sql`

## 7. การไหลข้อมูลสำคัญ

### 7.1 Login app directory

```text
กรอกรหัส
  → directory.authenticate
  → listAppDirectoryUsers
  → verifyDirectoryCode(hash/salt)
  → createDirectorySession
  → ตั้ง APP_DIRECTORY_SESSION_COOKIE
  → ทุก request อ่าน cookie ใน context
  → ctx.appUser พร้อมใช้กับ appProtectedProcedure
```

ระบบจะ migrate ค่า credential แบบ legacy เป็น hash เมื่อผู้ใช้ login สำเร็จ และไม่ส่ง plaintext code กลับไปที่ client

### 7.2 งานซ่อมและรับรถ

```text
Guide reportRepair
  → repairLog/vehicleFlow mutation
  → สร้าง repairJobs
  → vehicle ready → repair
  → vehicleStatusHistory

Mechanic markPickup
  → ปิด repairJobs
  → vehicle repair → pickup
  → สร้าง vehicleNotifications ให้ guide ในกลุ่ม

Guide receivePickup
  → vehicle pickup → ready
  → mark notification read
  → vehicleStatusHistory
```

### 7.3 สร้างและจบ session รถ

```text
createSession
  → vehicleSessions standby/active
  → vehicleSessionVehicles
  → vehicle status → active
  → history event standby_created หรือ session_started

activateSession
  → standby → active
  → startedAt

completeSession / cancelSession
  → active/standby → completed/cancelled
  → รถ active → ready
  → history event
```

### 7.4 Guide 2.3 → Active Queue → Team Board

```text
Guide UI บันทึก atv-guide-sessions-v1
              + atv-guide-state-v1
              ↓
activeSourceBridge อ่านและ map ชื่อ
              ↓
activeBridge.snapshot
              ↓
Team Board mirror/adapter
              ↓
รายการ Active ที่อ่านอย่างเดียวและ eventId สำหรับ reconcile
```

การ complete queue จะย้อนกลับไปเรียก service ที่เป็นเจ้าของกฎ ไม่ใช่แก้แค่หน้าจอ

### 7.5 Future Dice

```text
create
  → validate roster/mode/online requirement
  → futureDiceSessions + futureDicePlayers

roll
  → verify current turn and actor
  → crypto.randomInt สำหรับลูกเต๋า 2 ลูก
  → futureDiceRolls
  → resolveFutureDiceRolls
  → completed winner หรือรอบใหม่เมื่อเสมอ

winner chooses outcome
  → chooseFutureDiceOutcome
  → update selectedOutcome
  → append appLiveMessages room=future-dice
  → FutureDiceResultToast query ทุก 1 วินาที
  → แสดง 10 วินาที
```

### 7.6 RepairLog ภายนอก

```text
Guide/Mechanic UI
  → repairLog.submit
  → validate source/sheet/13 columns/rows
  → POST Google Apps Script
  → allowlist redirect
  → ตรวจ { ok: true }
```

## 8. Scheduled jobs และการดูแลข้อมูล

### Live message cleanup

`server/scheduledCleanup.ts` รับ callback จาก scheduled task ที่ authenticate ด้วย `sdk.authenticateRequest` ตรวจว่าเป็น cron และ task UID ตรงกับ metadata ใน `appMessageCleanupJobs` จากนั้นลบเฉพาะ `appLiveMessages` แบบ idempotent และไม่ลบ `appOperationalHistory`

### Expired vehicle session reconcile

`server/scheduledVehicleReconcile.ts` รับ cron ที่ผ่าน task authentication ตรวจ `vehicleFlowSchedules` และเรียก `reconcileExpiredVehicleSessions()` เพื่อเป็น backstop แม้ไม่มี browser polling อยู่

## 9. Environment และ secrets

ค่าที่ควรจัดการผ่าน project configuration/secrets ไม่ควร commit ลง Git:

- `DATABASE_URL` — MySQL connection
- app directory/special access secret ที่ใช้ bootstrap หรือ auth ตาม environment
- Manus OAuth/owner configuration ตาม platform
- Google Apps Script repair log URL
- ค่า storage/service API ตาม platform runtime

Frontend รับเฉพาะค่าที่ถูกเปิดเผยโดย `server/_core/publicConfig.ts` ห้ามนำ secret server-side ไป bundle ใน Vite

## 10. การตรวจสอบและคำสั่งดูแลระบบ

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
pnpm build
pnpm db:migrate
pnpm db:push
pnpm dev
pnpm start
```

ก่อน deploy ให้ตรวจอย่างน้อย:

1. `pnpm check` ผ่าน
2. `pnpm test` ผ่าน
3. `pnpm build` สำเร็จ
4. `DATABASE_URL` ใช้งานได้
5. migration ใน `drizzle/` ถูก apply
6. app session cookie ใช้ `SameSite=None; Secure` เมื่ออยู่บน HTTPS embedded preview
7. health endpoint และ `manus-routes.json` ตอบได้
8. Google Sheets integration ถูกตั้งค่าเฉพาะเมื่อจำเป็น
9. scheduled task metadata ตรงกับ task UID จริง

## 11. ขอบเขตที่ไม่ควรทำโดยไม่ตรวจผลกระทบ

- อย่าเขียนข้อมูลรถโดยตรงข้าม `vehicleFlowService`
- อย่าใช้ browser เป็น source of truth สำหรับ Future Dice
- อย่าลบ `appOperationalHistory` เมื่อ cleanup live messages
- อย่าแก้ `appOperationsSnapshots` แบบ replace ทั้งก้อน ถ้าต้องการแก้เพียง field เดียว ให้ใช้ merge
- อย่า force push ไปยัง repository อื่นโดยไม่ตรวจ branch/remote ให้ถูกต้อง
- อย่าใส่ plaintext code, database URL หรือ secret ในเอกสาร/commit

## 12. จุดเริ่มต้นสำหรับผู้ดูแลระบบ

หากระบบเปิดได้แต่ข้อมูลไม่ขึ้น ให้ตรวจตามลำดับ:

1. health ของ server และค่า `PORT`
2. `DATABASE_URL` และ migration
3. app directory session cookie และ `directory.me`
4. `operationsSnapshots` ที่เกี่ยวข้องกับโมดูล
5. `vehicleFlow.summary` / `vehicleFlow.activeQueue`
6. `futureDice.list` และ `liveMessages.list(room=future-dice)`
7. logs ของ scheduled cleanup/reconcile
8. Google Apps Script status หากมีเฉพาะปัญหา export RepairLog

เอกสารนี้เป็นเอกสารประกอบโค้ด ไม่ใช่การแทนที่ schema, authorization rule หรือ migration ที่อยู่ใน source code จริง
