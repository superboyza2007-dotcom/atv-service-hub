CREATE TABLE `mechanicRepairRecords` (
  `id` varchar(128) NOT NULL,
  `vehicleNumber` int NOT NULL,
  `symptom` text NOT NULL,
  `parts` text NOT NULL,
  `technician` varchar(128) NOT NULL,
  `decision` varchar(64),
  `status` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL,
  `updatedAt` timestamp NOT NULL,
  `sourceGuideRepairId` varchar(128),
  `accumulatedHoursAtRepair` double,
  `exportedAt` timestamp,
  `archivedAt` timestamp,
  CONSTRAINT `mechanicRepairRecords_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `mechanicRepairRecords_vehicle_created_lookup` ON `mechanicRepairRecords` (`vehicleNumber`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `mechanicRepairRecords_export_archive_lookup` ON `mechanicRepairRecords` (`exportedAt`,`archivedAt`);
