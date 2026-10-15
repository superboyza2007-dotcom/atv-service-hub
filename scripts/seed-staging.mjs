import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const url = new URL(databaseUrl);
const db = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  timezone: "Z",
});

const now = new Date();
const iso = now.toISOString();
const tables = [
  "appLiveMessages", "appOperationalHistory", "vehicleNotifications", "vehicleStatusHistory",
  "vehicleSessionVehicles", "vehicleSessions", "repairJobs", "vehicles", "vehicleGroupMembers",
  "vehicleGroups", "appOperationsSnapshots", "appDirectoryUsers", "users",
];
for (const table of tables) await db.query(`DELETE FROM \`${table}\``);

await db.query(`INSERT INTO users (id, openId, name, email, loginMethod, role, createdAt, updatedAt, lastSignedIn) VALUES
  (1, 'staging-guide', 'ไกด์ทดสอบ', 'guide@staging.local', 'directory', 'guide', ?, ?, ?),
  (2, 'staging-mechanic', 'ช่างทดสอบ', 'mechanic@staging.local', 'directory', 'mechanic', ?, ?, ?),
  (3, 'staging-supervisor', 'หัวหน้าทดสอบ', 'supervisor@staging.local', 'directory', 'supervisor', ?, ?, ?)
`, [now, now, now, now, now, now, now, now, now]);
await db.query(`INSERT INTO appDirectoryUsers (id, name, code, codeHash, codeSalt, userGroup, createdAt, updatedAt) VALUES
  (1, 'ไกด์ทดสอบ', 'GUIDE-DEMO-2026', NULL, NULL, 'ไกด์', ?, ?),
  (2, 'ช่างทดสอบ', 'MECHANIC-DEMO-2026', NULL, NULL, 'ช่าง', ?, ?),
  (3, 'หัวหน้าทดสอบ', 'SUPERVISOR-DEMO-2026', NULL, NULL, 'หัวหน้า', ?, ?)
`, [now, now, now, now, now, now]);
await db.query(`INSERT INTO vehicleGroups (id, code, name, createdAt, updatedAt) VALUES
  (1, 'DEMO-NORTH', 'ฝูงทดสอบเหนือ', ?, ?),
  (2, 'DEMO-SOUTH', 'ฝูงทดสอบใต้', ?, ?)
`, [now, now, now, now]);
await db.query(`INSERT INTO vehicleGroupMembers (groupId, userId, memberRole, createdAt) VALUES
  (1, 1, 'guide', ?), (1, 2, 'mechanic', ?), (2, 1, 'guide', ?), (2, 2, 'mechanic', ?)
`, [now, now, now, now]);
await db.query(`INSERT INTO vehicles (id, vehicleNumber, engineCc, groupId, vehicleStatus, updatedAt) VALUES
  (1, 101, '200', 1, 'active', ?),
  (2, 102, '200', 1, 'repair', ?),
  (3, 201, '250', 2, 'pickup', ?),
  (4, 202, '250', 2, 'ready', ?),
  (5, 203, '250', 2, 'ready', ?)
`, [now, now, now, now, now]);
await db.query(`INSERT INTO vehicleSessions (id, sessionCode, vehicleSessionStatus, durationMinutes, createdByUserId, startedAt, createdAt, updatedAt) VALUES
  (1, 'STG-ACTIVE-101', 'active', 30, 1, DATE_SUB(?, INTERVAL 8 MINUTE), ?, ?),
  (2, 'STG-STANDBY-202', 'standby', 60, 1, NULL, ?, ?)
`, [now, now, now, now, now]);
await db.query(`INSERT INTO vehicleSessionVehicles (sessionId, vehicleId) VALUES (1, 1), (2, 4)`);
await db.query(`INSERT INTO repairJobs (id, vehicleId, repairJobStatus, description, reportedByUserId, createdAt, updatedAt) VALUES (1, 2, 'open', 'ตรวจเบรกหน้าและเสียงผิดปกติ', 1, ?, ?)
`, [now, now]);
await db.query(`INSERT INTO vehicleStatusHistory (vehicleId, vehicleFromStatus, vehicleToStatus, vehicleFlowEvent, actorUserId, sessionId, note, createdAt) VALUES
  (1, 'ready', 'active', 'session_started', 1, 1, 'ข้อมูล staging: เริ่มรอบทดสอบ', ?),
  (2, 'ready', 'repair', 'guide_reported_repair', 1, NULL, 'ข้อมูล staging: แจ้งซ่อม', ?),
  (3, 'repair', 'pickup', 'mechanic_marked_pickup', 2, NULL, 'ข้อมูล staging: ซ่อมเสร็จ รอรับรถ', ?)
`, [now, now, now]);

const directoryUsers = [
  { id: 1, name: "ไกด์ทดสอบ", group: "ไกด์", hasCode: true },
  { id: 2, name: "ช่างทดสอบ", group: "ช่าง", hasCode: true },
  { id: 3, name: "หัวหน้าทดสอบ", group: "หัวหน้า", hasCode: true },
];
const vehicleDatabase = [
  { number: 101, cc: "200" }, { number: 102, cc: "200" },
  { number: 201, cc: "250" }, { number: 202, cc: "250" }, { number: 203, cc: "250" },
];
const fleetGroups = [{ id: "fleet-demo", name: "ฝูงทดสอบ", vehicleNumbers: [101, 102, 201, 202, 203], managerIds: [1, 2], color: "#81e597" }];
const guideReports = [{ id: "repair-demo-102", vehicleNumber: 102, status: "กำลังซ่อม", description: "ตรวจเบรกหน้าและเสียงผิดปกติ", reporter: "ไกด์ทดสอบ", createdAt: iso }];
const pickupRequests = [{ id: "pickup-demo-201", vehicleNumber: 201, description: "ซ่อมเสร็จแล้ว รอไกด์รับรถ", reporter: "ช่างทดสอบ", createdAt: iso }];
const vehicleState = {
  version: 1,
  vehicleGroups: [
    { cc: "200cc", numbers: [101, 102], unavailable: [102], pickup: [], inUse: [101] },
    { cc: "250cc", numbers: [201, 202, 203], unavailable: [], pickup: [201], inUse: [] },
  ],
  responsibilityGroups: [{ id: "fleet-demo", name: "ฝูงทดสอบ", managers: [1, 2], vehicleNumbers: [101, 102, 201, 202, 203], color: "#81e597" }],
  updatedAt: Date.now(),
};
const guideSessions = [
  { sessionId: "M3-STG-ACTIVE", status: "Active", durationMinutes: 30, vehicleIds: ["m3-v101"], memberIds: ["1"], activeUserId: "1", activeUserName: "ไกด์ทดสอบ", createdById: "1", createdByName: "ไกด์ทดสอบ", riderCount: 2, passengerCount: 1, createdAt: new Date(now.getTime() - 8 * 60_000).toISOString(), startedAt: new Date(now.getTime() - 8 * 60_000).toISOString() },
  { sessionId: "M3-STG-STANDBY", status: "Standby", durationMinutes: 60, vehicleIds: ["m3-v202"], memberIds: ["1"], activeUserId: "1", activeUserName: "ไกด์ทดสอบ", createdById: "1", createdByName: "ไกด์ทดสอบ", riderCount: 1, passengerCount: 0, createdAt: iso },
];
const snapshots = {
  "atv-fleet-state-v1": { vehicleState, directoryUsers, guideReports, guideState: { repairReports: guideReports }, mechanicState: { repairs: [{ vehicleNumber: 201, createdAt: iso, sourceGuideRepairId: "repair-demo-201" }] }, vehicleDatabase, fleetGroups, pickupRequests, usageHours: vehicleDatabase.map(v => ({ number: String(v.number), cc: v.cc, round30: 1, round60: 0, totalRounds: 1, accumulatedHours: 0.5, lastUsedAt: iso })) },
  "atv-guide-sessions-v1": { sessions: guideSessions, messages: [{ id: "msg-staging", sessionId: "M3-STG-ACTIVE", sender: "ช่างทดสอบ", text: "รับทราบรายการทดสอบ", createdAt: iso }], repairReports: guideReports },
  "atv-guide-state-v1": { repairReports: guideReports, members: directoryUsers },
  "atv-mechanic-state-v1": { alerts: [{ id: "alert-demo", vehicleNumber: 102, description: "ตรวจเบรกหน้าและเสียงผิดปกติ", reporter: "ไกด์ทดสอบ", createdAt: iso }], repairs: [{ vehicleNumber: 201, createdAt: iso, sourceGuideRepairId: "repair-demo-201" }] },
  "atv-vehicle-flow-v1": { pickupRequests, safetyNotices: [{ id: "notice-demo", vehicleNumber: 102, description: "ห้ามนำรถออกจนกว่าจะตรวจเบรก", reporter: "ช่างทดสอบ", createdAt: iso }], usageHours: vehicleDatabase.map(v => ({ number: v.number, accumulatedHours: 0.5, thresholdHours: 10 })) },
  "atv-run-queue-v1": { active: [{ id: "run-demo-101", vehicleNumber: 101, label: "รอบทดสอบ Active" }], standby: [{ id: "run-demo-202", vehicleNumber: 202, label: "รอบทดสอบ Standby" }] },
  "atv-communication-room-v1": { messages: [{ id: "room-demo", sender: "ช่างทดสอบ", text: "ห้องสื่อสาร staging พร้อมใช้งาน", createdAt: iso }] },
};
for (const [snapshotKey, value] of Object.entries(snapshots)) {
  await db.query("INSERT INTO appOperationsSnapshots (snapshotKey, payload, createdAt, updatedAt) VALUES (?, ?, ?, ?)", [snapshotKey, JSON.stringify(value), now, now]);
}
await db.end();
console.log(JSON.stringify({ ok: true, database: url.pathname.slice(1), users: 3, vehicles: 5, sessions: 2, snapshots: Object.keys(snapshots).length }, null, 2));
