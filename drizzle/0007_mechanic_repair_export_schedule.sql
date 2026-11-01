CREATE TABLE `mechanicRepairExportSchedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobKey` varchar(64) NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`lastRunAt` timestamp,
	`isEnabled` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `mechanicRepairExportSchedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `mechanicRepairExportSchedules_jobKey_unique` UNIQUE(`jobKey`)
);
--> statement-breakpoint
CREATE INDEX `mechanicRepairExportSchedules_task_uid_lookup` ON `mechanicRepairExportSchedules` (`scheduleCronTaskUid`);