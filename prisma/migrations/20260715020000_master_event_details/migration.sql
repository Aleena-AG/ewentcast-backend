-- AlterTable
ALTER TABLE `master_events`
  ADD COLUMN `category` VARCHAR(128) NULL,
  ADD COLUMN `timezone` VARCHAR(64) NULL,
  ADD COLUMN `description` TEXT NULL,
  ADD COLUMN `format` VARCHAR(32) NULL,
  ADD COLUMN `start_at` DATETIME(3) NULL,
  ADD COLUMN `end_at` DATETIME(3) NULL,
  ADD COLUMN `location_json` JSON NULL,
  ADD COLUMN `details_json` JSON NULL;
