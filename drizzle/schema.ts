import { foreignKey, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

export const VEHICLE_STATUS_VALUES = ["ready", "repair", "pickup", "active"] as const;
export type VehicleStatus = (typeof VEHICLE_STATUS_VALUES)[number];

export const VEHICLE_FLOW_EVENT_VALUES = [
  "guide_reported_repair",
  "repair_completed_without_pickup",
  "standby_created",
  "session_started",
  "session_completed",
  "session_cancelled",
  "mechanic_marked_pickup",
  "guide_received_vehicle",
] as const;
export type VehicleFlowEvent = (typeof VEHICLE_FLOW_EVENT_VALUES)[number];

/** Core user identity managed by Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "guide", "mechanic", "supervisor", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

/** Shared code-based directory used by the app login across all devices. */
export const appDirectoryUsers = mysqlTable("appDirectoryUsers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  /** Legacy compatibility during migration; clients must never receive this value after hashing rollout. */
  /** Nullable legacy field; new writes store null and use codeHash/codeSalt only. */
  code: varchar("code", { length: 128 }),
  codeHash: varchar("codeHash", { length: 255 }),
  codeSalt: varchar("codeSalt", { length: 64 }),
  userGroup: varchar("userGroup", { length: 64 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeUnique: uniqueIndex("appDirectoryUsers_code_unique").on(table.code),
}));

/** A fleet group whose assigned guides receive pickup notifications. */
export const vehicleGroups = mysqlTable("vehicleGroups", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  codeUnique: uniqueIndex("vehicleGroups_code_unique").on(table.code),
}));

/** Membership grants a guide or mechanic authority inside a particular fleet group. */
export const vehicleGroupMembers = mysqlTable("vehicleGroupMembers", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull().references(() => vehicleGroups.id, { onDelete: "cascade" }),
  userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  memberRole: mysqlEnum("memberRole", ["guide", "mechanic"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  groupUserUnique: uniqueIndex("vehicleGroupMembers_group_user_unique").on(table.groupId, table.userId),
  userLookup: index("vehicleGroupMembers_user_lookup").on(table.userId),
}));

/** Current source of truth for each ATV. */
export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  vehicleNumber: int("vehicleNumber").notNull(),
  engineCc: mysqlEnum("engineCc", ["200", "250"]).notNull(),
  groupId: int("groupId").notNull().references(() => vehicleGroups.id, { onDelete: "restrict" }),
  status: mysqlEnum("vehicleStatus", VEHICLE_STATUS_VALUES).default("ready").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  vehicleNumberUnique: uniqueIndex("vehicles_vehicleNumber_unique").on(table.vehicleNumber),
  groupStatusLookup: index("vehicles_group_status_lookup").on(table.groupId, table.status),
}));

/** Repair lifecycle used for the ready → repair → pickup path. */
export const repairJobs = mysqlTable("repairJobs", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
  status: mysqlEnum("repairJobStatus", ["open", "in_progress", "completed", "cancelled"]).default("open").notNull(),
  description: text("description").notNull(),
  reportedByUserId: int("reportedByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  completedByUserId: int("completedByUserId").references(() => users.id, { onDelete: "restrict" }),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  vehicleStatusLookup: index("repairJobs_vehicle_status_lookup").on(table.vehicleId, table.status),
}));

/** Standby/Active sessions reserve a vehicle until completed or cancelled. */
export const vehicleSessions = mysqlTable("vehicleSessions", {
  id: int("id").autoincrement().primaryKey(),
  sessionCode: varchar("sessionCode", { length: 64 }).notNull(),
  status: mysqlEnum("vehicleSessionStatus", ["standby", "active", "completed", "cancelled"]).default("standby").notNull(),
  durationMinutes: int("durationMinutes").notNull(),
  createdByUserId: int("createdByUserId").notNull().references(() => users.id, { onDelete: "restrict" }),
  startedAt: timestamp("startedAt"),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  sessionCodeUnique: uniqueIndex("vehicleSessions_sessionCode_unique").on(table.sessionCode),
  statusLookup: index("vehicleSessions_status_lookup").on(table.status),
}));

export const vehicleSessionVehicles = mysqlTable("vehicleSessionVehicles", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => vehicleSessions.id, { onDelete: "cascade" }),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
}, table => ({
  sessionVehicleUnique: uniqueIndex("vehicleSessionVehicles_session_vehicle_unique").on(table.sessionId, table.vehicleId),
  vehicleLookup: index("vehicleSessionVehicles_vehicle_lookup").on(table.vehicleId),
}));

/** Immutable audit trail for every permitted vehicle-status transition. */
export const vehicleStatusHistory = mysqlTable("vehicleStatusHistory", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id, { onDelete: "restrict" }),
  fromStatus: mysqlEnum("vehicleFromStatus", VEHICLE_STATUS_VALUES),
  toStatus: mysqlEnum("vehicleToStatus", VEHICLE_STATUS_VALUES).notNull(),
  eventType: mysqlEnum("vehicleFlowEvent", VEHICLE_FLOW_EVENT_VALUES).notNull(),
  actorUserId: int("actorUserId").references(() => users.id, { onDelete: "restrict" }),
  repairJobId: int("repairJobId").references(() => repairJobs.id, { onDelete: "set null" }),
  sessionId: int("sessionId").references(() => vehicleSessions.id, { onDelete: "set null" }),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  vehicleTimeLookup: index("vehicleStatusHistory_vehicle_time_lookup").on(table.vehicleId, table.createdAt),
  actorTimeLookup: index("vehicleStatusHistory_actor_time_lookup").on(table.actorUserId, table.createdAt),
}));

/** Pickup notifications are delivered to guides responsible for the vehicle's group. */
export const vehicleNotifications = mysqlTable("vehicleNotifications", {
  id: int("id").autoincrement().primaryKey(),
  vehicleId: int("vehicleId").notNull().references(() => vehicles.id, { onDelete: "cascade" }),
  recipientUserId: int("recipientUserId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: mysqlEnum("vehicleNotificationType", ["pickup_ready"]).notNull(),
  readAt: timestamp("readAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  recipientUnreadLookup: index("vehicleNotifications_recipient_unread_lookup").on(table.recipientUserId, table.readAt),
}));

/** Server-authoritative dice-game session; game state must not be owned by the browser. */
export const futureDiceSessions = mysqlTable("futureDiceSessions", {
  id: int("id").autoincrement().primaryKey(),
  status: mysqlEnum("futureDiceSessionStatus", ["open", "completed", "cancelled"]).default("open").notNull(),
  gameMode: mysqlEnum("futureDiceGameMode", ["one_vs_one", "two_vs_two"]).notNull(),
  outcomeType: mysqlEnum("futureDiceOutcomeType", ["minutes", "go_no_go"]).notNull(),
  currentTurn: int("currentTurn").default(0).notNull(),
  winningTeam: mysqlEnum("futureDiceWinningTeam", ["A", "B"]),
  selectedOutcome: varchar("selectedOutcome", { length: 16 }),
  createdByDirectoryUserId: int("createdByDirectoryUserId").references(() => appDirectoryUsers.id, { onDelete: "set null" }),
  createdByName: varchar("createdByName", { length: 128 }).notNull(),
  completedAt: timestamp("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  statusUpdatedLookup: index("futureDiceSessions_status_updated_lookup").on(table.status, table.updatedAt),
}));

/** Player roster is copied from the directory so historical games remain readable after a directory edit. */
export const futureDicePlayers = mysqlTable("futureDicePlayers", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => futureDiceSessions.id, { onDelete: "cascade" }),
  directoryUserId: int("directoryUserId").references(() => appDirectoryUsers.id, { onDelete: "set null" }),
  playerName: varchar("playerName", { length: 128 }).notNull(),
  slot: mysqlEnum("futureDicePlayerSlot", ["A1", "B1", "A2", "B2"]).notNull(),
  team: mysqlEnum("futureDicePlayerTeam", ["A", "B"]).notNull(),
  turnOrder: int("turnOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  sessionSlotUnique: uniqueIndex("futureDicePlayers_session_slot_unique").on(table.sessionId, table.slot),
  sessionTurnUnique: uniqueIndex("futureDicePlayers_session_turn_unique").on(table.sessionId, table.turnOrder),
  directoryLookup: index("futureDicePlayers_directory_lookup").on(table.directoryUserId),
}));

/** Each row is a server-generated immutable dice result for one turn. */
export const futureDiceRolls = mysqlTable("futureDiceRolls", {
  id: int("id").autoincrement().primaryKey(),
  sessionId: int("sessionId").notNull().references(() => futureDiceSessions.id, { onDelete: "cascade" }),
  playerId: int("playerId").notNull().references(() => futureDicePlayers.id, { onDelete: "restrict" }),
  turnOrder: int("turnOrder").notNull(),
  dieOne: int("dieOne").notNull(),
  dieTwo: int("dieTwo").notNull(),
  total: int("total").notNull(),
  rolledByDirectoryUserId: int("rolledByDirectoryUserId").references(() => appDirectoryUsers.id, { onDelete: "set null" }),
  rolledByName: varchar("rolledByName", { length: 128 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  sessionTurnUnique: uniqueIndex("futureDiceRolls_session_turn_unique").on(table.sessionId, table.turnOrder),
  sessionTimeLookup: index("futureDiceRolls_session_time_lookup").on(table.sessionId, table.createdAt),
}));

/** Shared app state for code-based modules that do not use Manus OAuth identity. */
export const appOperationsSnapshots = mysqlTable("appOperationsSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  snapshotKey: varchar("snapshotKey", { length: 64 }).notNull(),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  snapshotKeyUnique: uniqueIndex("appOperationsSnapshots_key_unique").on(table.snapshotKey),
}));

/** Immutable server-owned history, deliberately separate from live chat. */
export const appOperationalHistory = mysqlTable("appOperationalHistory", {
  id: int("id").autoincrement().primaryKey(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  module: mysqlEnum("module", ["guide", "mechanic", "supervisor", "system"]).notNull(),
  actorDirectoryUserId: int("actorDirectoryUserId"),
  sessionId: int("sessionId").references(() => vehicleSessions.id, { onDelete: "set null" }),
  vehicleId: int("vehicleId").references(() => vehicles.id, { onDelete: "set null" }),
  payload: text("payload").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  eventTimeLookup: index("appOperationalHistory_event_time_lookup").on(table.eventType, table.createdAt),
  sessionTimeLookup: index("appOperationalHistory_session_time_lookup").on(table.sessionId, table.createdAt),
  actorDirectoryUser: foreignKey({ name: "appOpHistory_actorDirectoryUser_fk", columns: [table.actorDirectoryUserId], foreignColumns: [appDirectoryUsers.id] }).onDelete("set null"),
}));

/** Live messages only. These rows are eligible for the midnight cleanup and are never the history store. */
export const appLiveMessages = mysqlTable("appLiveMessages", {
  id: int("id").autoincrement().primaryKey(),
  channelType: mysqlEnum("channelType", ["active", "room"]).notNull(),
  channelId: varchar("channelId", { length: 128 }).notNull(),
  sessionId: int("sessionId").references(() => vehicleSessions.id, { onDelete: "set null" }),
  senderDirectoryUserId: int("senderDirectoryUserId").references(() => appDirectoryUsers.id, { onDelete: "set null" }),
  senderModule: mysqlEnum("senderModule", ["guide", "mechanic", "supervisor"]).notNull(),
  senderName: varchar("senderName", { length: 128 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({
  channelTimeLookup: index("appLiveMessages_channel_time_lookup").on(table.channelType, table.channelId, table.createdAt),
  sessionTimeLookup: index("appLiveMessages_session_time_lookup").on(table.sessionId, table.createdAt),
}));

/** Durable cleanup metadata for the daily live-message cleanup heartbeat. */
export const appMessageCleanupJobs = mysqlTable("appMessageCleanupJobs", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  lastRunAt: timestamp("lastRunAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  jobKeyUnique: uniqueIndex("appMessageCleanupJobs_job_key_unique").on(table.jobKey),
  taskUidLookup: index("appMessageCleanupJobs_task_uid_lookup").on(table.scheduleCronTaskUid),
}));

/** Durable metadata for the one project-level job that reconciles expired Active sessions. */
export const vehicleFlowSchedules = mysqlTable("vehicleFlowSchedules", {
  id: int("id").autoincrement().primaryKey(),
  jobKey: varchar("jobKey", { length: 64 }).notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  cronExpression: varchar("cronExpression", { length: 64 }).notNull(),
  isEnabled: int("isEnabled").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({
  jobKeyUnique: uniqueIndex("vehicleFlowSchedules_jobKey_unique").on(table.jobKey),
  taskUidLookup: index("vehicleFlowSchedules_task_uid_lookup").on(table.scheduleCronTaskUid),
}));

export type User = typeof users.$inferSelect;
export type AppDirectoryUser = typeof appDirectoryUsers.$inferSelect;
export type InsertAppDirectoryUser = typeof appDirectoryUsers.$inferInsert;
export type InsertUser = typeof users.$inferInsert;
export type AppOperationalHistory = typeof appOperationalHistory.$inferSelect;
export type AppLiveMessage = typeof appLiveMessages.$inferSelect;
export type Vehicle = typeof vehicles.$inferSelect;
export type VehicleGroup = typeof vehicleGroups.$inferSelect;
export type VehicleStatusHistory = typeof vehicleStatusHistory.$inferSelect;
export type FutureDiceSession = typeof futureDiceSessions.$inferSelect;
export type FutureDicePlayer = typeof futureDicePlayers.$inferSelect;
export type FutureDiceRoll = typeof futureDiceRolls.$inferSelect;
