ALTER TABLE `vehicleStatusHistory`
  MODIFY COLUMN `vehicleFlowEvent` enum('guide_reported_repair','repair_completed_without_pickup','standby_created','session_started','session_completed','session_cancelled','mechanic_marked_pickup','guide_received_vehicle') NOT NULL;
