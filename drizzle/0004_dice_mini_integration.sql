ALTER TABLE `futureDiceSessions` ADD `currentRound` int NOT NULL DEFAULT 1 AFTER `currentTurn`;
--> statement-breakpoint
ALTER TABLE `futureDiceRolls` ADD `round` int NOT NULL DEFAULT 1 AFTER `sessionId`;
--> statement-breakpoint
ALTER TABLE `futureDiceRolls` DROP INDEX `futureDiceRolls_session_turn_unique`;
--> statement-breakpoint
CREATE UNIQUE INDEX `futureDiceRolls_session_round_turn_unique` ON `futureDiceRolls` (`sessionId`, `round`, `turnOrder`);
--> statement-breakpoint
CREATE TABLE `appDirectoryPresence` (
  `id` int AUTO_INCREMENT NOT NULL,
  `directoryUserId` int NOT NULL,
  `lastSeenAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `appDirectoryPresence_id` PRIMARY KEY(`id`),
  CONSTRAINT `appDirectoryPresence_directory_user_unique` UNIQUE(`directoryUserId`)
);
--> statement-breakpoint
ALTER TABLE `appDirectoryPresence` ADD CONSTRAINT `appDirectoryPresence_directoryUserId_appDirectoryUsers_id_fk` FOREIGN KEY (`directoryUserId`) REFERENCES `appDirectoryUsers`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `appDirectoryPresence_last_seen_lookup` ON `appDirectoryPresence` (`lastSeenAt`);
