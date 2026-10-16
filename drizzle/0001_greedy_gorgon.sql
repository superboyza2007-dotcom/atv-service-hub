CREATE TABLE `appDirectoryUsers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(128) NOT NULL,
	`code` varchar(128),
	`codeHash` varchar(255),
	`codeSalt` varchar(64),
	`userGroup` varchar(64) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appDirectoryUsers_id` PRIMARY KEY(`id`),
	CONSTRAINT `appDirectoryUsers_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `appLiveMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`channelType` enum('active','room') NOT NULL,
	`channelId` varchar(128) NOT NULL,
	`sessionId` int,
	`senderDirectoryUserId` int,
	`senderModule` enum('guide','mechanic','supervisor') NOT NULL,
	`senderName` varchar(128) NOT NULL,
	`body` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appLiveMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appMessageCleanupJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appMessageCleanupJobs_id` PRIMARY KEY(`id`),
	CONSTRAINT `appMessageCleanupJobs_job_key_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `appOperationalHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventType` varchar(64) NOT NULL,
	`module` enum('guide','mechanic','supervisor','system') NOT NULL,
	`actorDirectoryUserId` int,
	`sessionId` int,
	`vehicleId` int,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `appOperationalHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `appOperationsSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`snapshotKey` varchar(64) NOT NULL,
	`payload` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appOperationsSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `appOperationsSnapshots_key_unique` UNIQUE(`snapshotKey`)
);
--> statement-breakpoint
CREATE TABLE `repairJobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`repairJobStatus` enum('open','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
	`description` text NOT NULL,
	`reportedByUserId` int NOT NULL,
	`completedByUserId` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `repairJobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicleFlowSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL,
	`isEnabled` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicleFlowSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicleFlowSchedules_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE TABLE `vehicleGroupMembers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`groupId` int NOT NULL,
	`userId` int NOT NULL,
	`memberRole` enum('guide','mechanic') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicleGroupMembers_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicleGroupMembers_group_user_unique` UNIQUE(`groupId`,`userId`)
);
--> statement-breakpoint
CREATE TABLE `vehicleGroups` (
	`id` int AUTO_INCREMENT NOT NULL,
	`code` varchar(32) NOT NULL,
	`name` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicleGroups_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicleGroups_code_unique` UNIQUE(`code`)
);
--> statement-breakpoint
CREATE TABLE `vehicleNotifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`recipientUserId` int NOT NULL,
	`vehicleNotificationType` enum('pickup_ready') NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicleNotifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicleSessionVehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`vehicleId` int NOT NULL,
	CONSTRAINT `vehicleSessionVehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicleSessionVehicles_session_vehicle_unique` UNIQUE(`sessionId`,`vehicleId`)
);
--> statement-breakpoint
CREATE TABLE `vehicleSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionCode` varchar(64) NOT NULL,
	`vehicleSessionStatus` enum('standby','active','completed','cancelled') NOT NULL DEFAULT 'standby',
	`durationMinutes` int NOT NULL,
	`createdByUserId` int NOT NULL,
	`startedAt` timestamp,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicleSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicleSessions_sessionCode_unique` UNIQUE(`sessionCode`)
);
--> statement-breakpoint
CREATE TABLE `vehicleStatusHistory` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleId` int NOT NULL,
	`vehicleFromStatus` enum('ready','repair','pickup','active'),
	`vehicleToStatus` enum('ready','repair','pickup','active') NOT NULL,
	`vehicleFlowEvent` enum('guide_reported_repair','standby_created','session_started','session_completed','session_cancelled','mechanic_marked_pickup','guide_received_vehicle') NOT NULL,
	`actorUserId` int,
	`repairJobId` int,
	`sessionId` int,
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `vehicleStatusHistory_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`vehicleNumber` int NOT NULL,
	`engineCc` enum('200','250') NOT NULL,
	`groupId` int NOT NULL,
	`vehicleStatus` enum('ready','repair','pickup','active') NOT NULL DEFAULT 'ready',
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `vehicles_id` PRIMARY KEY(`id`),
	CONSTRAINT `vehicles_vehicleNumber_unique` UNIQUE(`vehicleNumber`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','guide','mechanic','supervisor','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `appLiveMessages` ADD CONSTRAINT `appLiveMessages_sessionId_vehicleSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `vehicleSessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appLiveMessages` ADD CONSTRAINT `appLiveMessages_senderDirectoryUserId_appDirectoryUsers_id_fk` FOREIGN KEY (`senderDirectoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appOperationalHistory` ADD CONSTRAINT `appOperationalHistory_sessionId_vehicleSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `vehicleSessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appOperationalHistory` ADD CONSTRAINT `appOperationalHistory_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `appOperationalHistory` ADD CONSTRAINT `appOpHistory_actorDirectoryUser_fk` FOREIGN KEY (`actorDirectoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairJobs` ADD CONSTRAINT `repairJobs_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairJobs` ADD CONSTRAINT `repairJobs_reportedByUserId_users_id_fk` FOREIGN KEY (`reportedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `repairJobs` ADD CONSTRAINT `repairJobs_completedByUserId_users_id_fk` FOREIGN KEY (`completedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleGroupMembers` ADD CONSTRAINT `vehicleGroupMembers_groupId_vehicleGroups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `vehicleGroups`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleGroupMembers` ADD CONSTRAINT `vehicleGroupMembers_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleNotifications` ADD CONSTRAINT `vehicleNotifications_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleNotifications` ADD CONSTRAINT `vehicleNotifications_recipientUserId_users_id_fk` FOREIGN KEY (`recipientUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleSessionVehicles` ADD CONSTRAINT `vehicleSessionVehicles_sessionId_vehicleSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `vehicleSessions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleSessionVehicles` ADD CONSTRAINT `vehicleSessionVehicles_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleSessions` ADD CONSTRAINT `vehicleSessions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleStatusHistory` ADD CONSTRAINT `vehicleStatusHistory_vehicleId_vehicles_id_fk` FOREIGN KEY (`vehicleId`) REFERENCES `vehicles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleStatusHistory` ADD CONSTRAINT `vehicleStatusHistory_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleStatusHistory` ADD CONSTRAINT `vehicleStatusHistory_repairJobId_repairJobs_id_fk` FOREIGN KEY (`repairJobId`) REFERENCES `repairJobs`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicleStatusHistory` ADD CONSTRAINT `vehicleStatusHistory_sessionId_vehicleSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `vehicleSessions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `vehicles` ADD CONSTRAINT `vehicles_groupId_vehicleGroups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `vehicleGroups`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `appLiveMessages_channel_time_lookup` ON `appLiveMessages` (`channelType`,`channelId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `appLiveMessages_session_time_lookup` ON `appLiveMessages` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `appMessageCleanupJobs_task_uid_lookup` ON `appMessageCleanupJobs` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `appOperationalHistory_event_time_lookup` ON `appOperationalHistory` (`eventType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `appOperationalHistory_session_time_lookup` ON `appOperationalHistory` (`sessionId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `repairJobs_vehicle_status_lookup` ON `repairJobs` (`vehicleId`,`repairJobStatus`);--> statement-breakpoint
CREATE INDEX `vehicleFlowSchedules_task_uid_lookup` ON `vehicleFlowSchedules` (`scheduleCronTaskUid`);--> statement-breakpoint
CREATE INDEX `vehicleGroupMembers_user_lookup` ON `vehicleGroupMembers` (`userId`);--> statement-breakpoint
CREATE INDEX `vehicleNotifications_recipient_unread_lookup` ON `vehicleNotifications` (`recipientUserId`,`readAt`);--> statement-breakpoint
CREATE INDEX `vehicleSessionVehicles_vehicle_lookup` ON `vehicleSessionVehicles` (`vehicleId`);--> statement-breakpoint
CREATE INDEX `vehicleSessions_status_lookup` ON `vehicleSessions` (`vehicleSessionStatus`);--> statement-breakpoint
CREATE INDEX `vehicleStatusHistory_vehicle_time_lookup` ON `vehicleStatusHistory` (`vehicleId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vehicleStatusHistory_actor_time_lookup` ON `vehicleStatusHistory` (`actorUserId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `vehicles_group_status_lookup` ON `vehicles` (`groupId`,`vehicleStatus`);