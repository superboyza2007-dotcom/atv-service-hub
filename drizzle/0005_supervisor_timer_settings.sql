ALTER TABLE `vehicleSessions`
  ADD `timerEnabled` boolean NOT NULL DEFAULT true AFTER `durationMinutes`;
--> statement-breakpoint
ALTER TABLE `vehicleSessions`
  ADD `expiryBehavior` enum('auto_complete','overtime') NOT NULL DEFAULT 'auto_complete' AFTER `timerEnabled`;
