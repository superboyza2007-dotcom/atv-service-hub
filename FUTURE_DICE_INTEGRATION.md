# Future เกมทอยลูกเต๋า — เอกสารส่งต่อให้ AI เจ้าของ Server

## อ่านก่อนเริ่มงาน

ฟีเจอร์นี้ถูกเพิ่มเข้า Branch `main` แล้วใน Commit ที่เพิ่มแท็บ Future เดิม โดยเอกสารนี้อธิบายชัดเจนว่าโค้ดทำถึงจุดไหนแล้ว และส่วนใดที่ต้องสร้างต่อเพื่อให้ใช้งานออนไลน์จริง

ให้ดึงโค้ดล่าสุดก่อน:

```bash
git pull origin main
```

## สิ่งที่มีอยู่แล้วใน Source Code

ไฟล์หลัก:

```text
client/src/pages/SupervisorModule.tsx
client/src/components/FutureDiceGame.tsx
client/src/index.css
```

สิ่งที่ทำไว้แล้ว:

- เพิ่มแท็บรองที่สามชื่อ `Future` ในหน้า `คิวและตารางค่ารอบ`
- แท็บรองทั้งสามแบ่งความกว้างเท่ากันและรองรับหน้าจอมือถือ
- เปิดหน้าเกมทอยลูกเต๋าจากแท็บ Future ได้
- UI เกมแบบมินิ ไม่ใช่ Dashboard ใหม่
- เลือกประเภทผล `30/60` หรือ `ไป/ไม่ไป`
- เลือกโหมด `1vs1` หรือ `2vs2`
- โหมด 2vs2 แสดงลำดับ `A1 → B1 → A2 → B2`
- ทอยลูกเต๋า 2 ลูกต่อช่อง
- รวมคะแนนทีมและแสดงผู้ชนะ
- ผู้ชนะเลือกผลลัพธ์ได้ในต้นแบบ
- เริ่มรายการใหม่ได้

## ข้อจำกัดที่ยังมีอยู่

`FutureDiceGame.tsx` ตอนนี้เป็น **Frontend Prototype แบบจำลองใน Browser** เท่านั้น:

- ผลลูกเต๋ายังสุ่มใน Browser
- ยังไม่บันทึกลง Database
- ยังไม่ใช้ Session กลางร่วมกันหลายเครื่อง
- ยังไม่ตรวจสิทธิ์จาก Server
- ยังไม่ใช้รายชื่อผู้ใช้จริงในช่องผู้เล่น
- ยังไม่มี Realtime ของ Dice Session
- ยังไม่ประกาศผลกลับระบบข้อความกลางของแอปหลัก
- ยังไม่มีการ Reset Session ฝั่ง Server

ห้ามถือว่าโค้ดปัจจุบันพร้อมใช้งานออนไลน์จริงจนกว่าจะทำส่วน Backend ด้านล่างครบ

## งานที่ต้องสร้างต่อฝั่ง Server

### 1. สร้างตาราง Database เฉพาะสำหรับเกม

แนะนำให้เพิ่มใน `drizzle/schema.ts` อย่างน้อย:

```text
diceSessions
- id
- choiceType: 30_60 | go_no_go
- mode: 1v1 | 2v2
- status: waiting | rolling | winner_selecting | completed
- createdByDirectoryUserId
- selectedChoice
- round
- createdAt
- updatedAt

dicePlayers
- id
- sessionId
- directoryUserId
- displayNameSnapshot
- team: A | B
- slot: 0 | 1
- isOnline
- createdAt

diceRolls
- id
- sessionId
- round
- playerId
- rolledByDirectoryUserId
- die1
- die2
- total
- createdAt
```

ใช้ `appDirectoryUsers.id` เป็นตัวระบุผู้ใช้จริง ห้ามใช้ชื่อเป็นตัวตรวจสิทธิ์

### 2. สร้าง tRPC Router

เพิ่ม Router ใหม่ใน `server/routers.ts` เช่น `dice` โดยชื่อจริงปรับตามมาตรฐานโปรเจกต์ได้:

```text
dice.createSession(input)
dice.getSession({ sessionId })
dice.listOpenSessions()
dice.roll({ sessionId, playerId })
dice.selectChoice({ sessionId, choice })
dice.resetSession({ sessionId })
dice.publishResult({ sessionId })
```

ห้ามให้ Frontend ส่งผลลูกเต๋าเข้ามาเอง ให้ Server เป็นผู้สุ่มและบันทึกผล

### 3. ตรวจสิทธิ์ฝั่ง Server

ทุก Mutation ต้องใช้ Session Login เดิมของแอปหลัก และตรวจ `ctx.appUser` หรือกลไกตัวตนที่โปรเจกต์ใช้อยู่จริง:

- ผู้สร้างที่ไม่ได้อยู่ในรายชื่อผู้เล่นเป็นผู้ชม
- ผู้เล่นกดทอยได้เฉพาะช่องของตนเอง
- ลำดับ 2vs2 ต้องเป็น `A1 → B1 → A2 → B2`
- ทอยซ้ำไม่ได้
- ทอยข้ามลำดับไม่ได้
- ทอยแทนได้เฉพาะสมาชิกทีมเดียวกันที่ไม่ออนไลน์
- ทอยแทนทีมตรงข้ามไม่ได้
- ผู้ชนะหรือสมาชิกทีมผู้ชนะเท่านั้นที่เลือกผลลัพธ์
- ผู้ชมเลือกผลลัพธ์ไม่ได้

### 4. ทำ Realtime ให้หลายเครื่องเห็นข้อมูลเดียวกัน

โปรเจกต์มี WebSocket อยู่แล้วใน `server/ptt-signaling.ts` และมีการใช้ WebSocket ใน `client/src/components/PttRoom.tsx` เป็นตัวอย่าง

ให้สร้าง Channel/Message Type สำหรับ Dice Session แยกจาก PTT เช่น:

```text
dice_session_updated
```

เมื่อมีการสร้าง Session, ทอย, ตัดสินเสมอ, เลือกผล หรือ Reset ให้ส่งสถานะล่าสุดไปยังผู้เล่นและผู้ชมทุกคนใน Session เดียวกัน

ห้ามใช้ข้อมูลใน Browser เป็น Source of Truth

### 5. เชื่อมรายชื่อผู้ใช้จริง

ระบบรายชื่อและ Login ที่มีอยู่แล้ว:

```text
server/routers.ts
  directory.list
  directory.me
  directory.authenticate

server/db.ts
  listAppDirectoryUsers

dizzle/schema.ts
  appDirectoryUsers
```

ใช้ข้อมูลนี้เติม Dropdown และใช้ ID จริงใน `dicePlayers`

### 6. ประกาศผลกลับแอปหลัก

เมื่อผู้ชนะเลือก `30`, `60`, `ไป` หรือ `ไม่ไป` ให้สร้างข้อความประกาศไปยังระบบข้อความกลางที่มีอยู่แล้ว:

```text
liveMessages.send
```

หรือสร้าง Service ฝั่ง Server ที่เรียก `appendLiveMessage` โดยตรงตามรูปแบบที่เหมาะสมกว่า

ตัวอย่างข้อความ:

```text
ทีม A: นายเอ และ นายบี เลือก 60 · ทีม B: นายซี และ นายดี ได้ 30
```

ข้อความต้องแสดงในระบบหลักประมาณ 10 วินาทีตามระบบประกาศที่มีอยู่ แล้วปิดหรือ Reset Dice Session

## จุดที่ต้องเชื่อม Frontend ต่อ

หลัง Backend พร้อมแล้ว ให้แก้ `client/src/components/FutureDiceGame.tsx` ดังนี้:

1. เปลี่ยน `useState` ของ `rolls` ให้ใช้ข้อมูลจาก `trpc.dice.getSession`
2. เปลี่ยนฟังก์ชันสุ่มใน Browser ให้เรียก `trpc.dice.roll.useMutation`
3. เพิ่มการ subscribe หรือ invalidate Query เมื่อได้รับ `dice_session_updated`
4. ใช้ผู้ใช้จริงจาก `directory.list` แทนชื่อจำลอง `นาย A` ถึง `นาย D`
5. ซ่อนปุ่มทอยถ้าผู้ใช้ปัจจุบันไม่มีสิทธิ์
6. แสดงสถานะผู้ชมเมื่อผู้เปิดไม่ได้เป็นผู้เล่น
7. เรียก `dice.selectChoice` เมื่อผู้ชนะเลือกผล
8. แสดงข้อความรอเมื่อผู้เล่นอื่นเป็นคนที่ถึงตา

## เงื่อนไขตรวจรับก่อนบอกว่าใช้งานจริงได้

- เปิด Future จากหน้า Supervisor ได้
- ผู้สร้างไม่ใช่ผู้เล่นแต่ดูผลได้
- เลือกรายชื่อจริงจาก `appDirectoryUsers` ได้
- ผู้เล่น A และ B เปิดจากคนละเครื่องแล้วเห็น Session เดียวกัน
- A ทอยแล้ว B และผู้ชมเห็นผลเดียวกัน
- ลำดับ 2vs2 บังคับเป็น `A1 → B1 → A2 → B2`
- ทอยซ้ำและทอยข้ามลำดับไม่ได้ แม้เรียก API โดยตรง
- ทอยแทนได้เฉพาะสมาชิกทีมเดียวกันที่ไม่ออนไลน์
- ผลสุ่มถูกสร้างโดย Server และเก็บใน Database
- ผู้ชนะเลือกผลได้ คนแพ้และผู้ชมเลือกไม่ได้
- ทุกคนเห็นข้อความประกาศผลในแอปหลัก
- Session ปิดหรือ Reset หลังประกาศผล
- `pnpm check`, `pnpm test` และ `pnpm build` ผ่าน

## สรุปสถานะ

```text
แท็บ Future และ UI เกม                 ทำแล้ว
Prototype กติกาและลำดับทอย             ทำแล้ว
Database เกม                            ต้องสร้างต่อ
Dice tRPC API                          ต้องสร้างต่อ
Server authorization                    ต้องสร้างต่อ
Realtime Dice Session                   ต้องสร้างต่อ
เชื่อมผู้ใช้จริง                        ต้องสร้างต่อ
ประกาศผลเข้า liveMessages              ต้องสร้างต่อ
เล่นออนไลน์หลายเครื่อง                 ยังไม่พร้อมจนกว่างานด้านบนเสร็จ
```
