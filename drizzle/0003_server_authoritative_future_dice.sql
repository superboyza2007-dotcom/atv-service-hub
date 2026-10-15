CREATE TABLE `futureDiceSessions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `futureDiceSessionStatus` enum('open','completed','cancelled') NOT NULL DEFAULT 'open',
  `futureDiceGameMode` enum('one_vs_one','two_vs_two') NOT NULL,
  `futureDiceOutcomeType` enum('minutes','go_no_go') NOT NULL,
  `currentTurn` int NOT NULL DEFAULT 0,
  `futureDiceWinningTeam` enum('A','B'),
  `selectedOutcome` varchar(16),
  `createdByDirectoryUserId` int,
  `createdByName` varchar(128) NOT NULL,
  `completedAt` timestamp,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `futureDiceSessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `futureDicePlayers` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `directoryUserId` int,
  `playerName` varchar(128) NOT NULL,
  `futureDicePlayerSlot` enum('A1','B1','A2','B2') NOT NULL,
  `futureDicePlayerTeam` enum('A','B') NOT NULL,
  `turnOrder` int NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `futureDicePlayers_id` PRIMARY KEY(`id`),
  CONSTRAINT `futureDicePlayers_session_slot_unique` UNIQUE(`sessionId`,`futureDicePlayerSlot`),
  CONSTRAINT `futureDicePlayers_session_turn_unique` UNIQUE(`sessionId`,`turnOrder`)
);
--> statement-breakpoint
CREATE TABLE `futureDiceRolls` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sessionId` int NOT NULL,
  `playerId` int NOT NULL,
  `turnOrder` int NOT NULL,
  `dieOne` int NOT NULL,
  `dieTwo` int NOT NULL,
  `total` int NOT NULL,
  `rolledByDirectoryUserId` int,
  `rolledByName` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `futureDiceRolls_id` PRIMARY KEY(`id`),
  CONSTRAINT `futureDiceRolls_session_turn_unique` UNIQUE(`sessionId`,`turnOrder`)
);
--> statement-breakpoint
ALTER TABLE `futureDiceSessions` ADD CONSTRAINT `futureDiceSessions_createdByDirectoryUserId_appDirectoryUsers_id_fk` FOREIGN KEY (`createdByDirectoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `futureDicePlayers` ADD CONSTRAINT `futureDicePlayers_sessionId_futureDiceSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `futureDiceSessions`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `futureDicePlayers` ADD CONSTRAINT `futureDicePlayers_directoryUserId_appDirectoryUsers_id_fk` FOREIGN KEY (`directoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `futureDiceRolls` ADD CONSTRAINT `futureDiceRolls_sessionId_futureDiceSessions_id_fk` FOREIGN KEY (`sessionId`) REFERENCES `futureDiceSessions`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `futureDiceRolls` ADD CONSTRAINT `futureDiceRolls_playerId_futureDicePlayers_id_fk` FOREIGN KEY (`playerId`) REFERENCES `futureDicePlayers`(`id`) ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `futureDiceRolls` ADD CONSTRAINT `futureDiceRolls_rolledByDirectoryUserId_appDirectoryUsers_id_fk` FOREIGN KEY (`rolledByDirectoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `futureDiceSessions_status_updated_lookup` ON `futureDiceSessions` (`futureDiceSessionStatus`,`updatedAt`);
--> statement-breakpoint
CREATE INDEX `futureDicePlayers_directory_lookup` ON `futureDicePlayers` (`directoryUserId`);
--> statement-breakpoint
CREATE INDEX `futureDiceRolls_session_time_lookup` ON `futureDiceRolls` (`sessionId`,`createdAt`);
