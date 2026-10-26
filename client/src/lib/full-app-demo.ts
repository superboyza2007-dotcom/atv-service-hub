import type { VehicleResponsibilityState } from "@/lib/vehicle-responsibility-store";

export const FULL_APP_DEMO_QUERY = "full-app";
export const FULL_APP_DEMO_USERS = [
  { id: 701, name: "ก้องภพ ไกด์", group: "ไกด์" },
  { id: 702, name: "มินตรา ไกด์", group: "ไกด์" },
  { id: 703, name: "ธนกฤต ไกด์", group: "ไกด์" },
  { id: 704, name: "ชาญ ช่าง", group: "ช่าง" },
  { id: 705, name: "พีระ ช่าง", group: "ช่าง" },
  { id: 706, name: "ศุภชัย หัวหน้า", group: "หัวหน้า" },
  { id: 707, name: "อรทัย ดิวตี้", group: "ดิวตี้" },
] as const;

export const FULL_APP_DEMO_VEHICLES = [
  { number: 21, cc: "200" as const },
  { number: 22, cc: "200" as const },
  { number: 23, cc: "200" as const },
  { number: 24, cc: "250" as const },
  { number: 25, cc: "250" as const },
  { number: 26, cc: "250" as const },
  { number: 27, cc: "250" as const },
];

export const FULL_APP_DEMO_VEHICLE_STATE: VehicleResponsibilityState = {
  version: 1,
  updatedAt: 0,
  vehicleGroups: [
    { cc: "200cc", label: "กลุ่มรถ 200 ซีซี", numbers: [21, 22, 23], notifications: [22], inUse: [23] },
    { cc: "250cc", label: "กลุ่มรถ 250 ซีซี", numbers: [24, 25, 26, 27], unavailable: [25], pickup: [26] },
  ],
  responsibilityGroups: [
    { id: "demo-east", name: "กลุ่มตะวันออก", managers: [701, 704], vehicleNumbers: [21, 22, 24, 25], color: "#81e597" },
    { id: "demo-west", name: "กลุ่มตะวันตก", managers: [702, 705], vehicleNumbers: [23, 26, 27], color: "#70b7ff" },
  ],
};

export const FULL_APP_DEMO_FLEET_GROUPS = [
  { id: "demo-east", name: "กลุ่มตะวันออก", vehicleNumbers: [21, 22, 24, 25], managerIds: [701, 704], color: "#81e597" },
  { id: "demo-west", name: "กลุ่มตะวันตก", vehicleNumbers: [23, 26, 27], managerIds: [702, 705], color: "#70b7ff" },
] as const;

export const FULL_APP_DEMO_REPAIR_REPORTS = [
  { id: "demo-repair-21", vehicleId: "m3-v21", description: "เบรกหน้ามีเสียงดังเมื่อชะลอความเร็ว", reporter: "ก้องภพ ไกด์", createdAt: "2026-10-27T00:40:00.000Z", status: "แจ้งซ่อม" as const },
  { id: "demo-repair-25", vehicleId: "m3-v25", description: "ยางหลังสึก ต้องเปลี่ยนก่อนนำรถออกใช้งาน", reporter: "มินตรา ไกด์", createdAt: "2026-10-27T00:20:00.000Z", status: "แจ้งซ่อม" as const },
];

export function isFullAppDemo() {
  return typeof window !== "undefined" && new URLSearchParams(window.location.search).get("demo") === FULL_APP_DEMO_QUERY;
}
