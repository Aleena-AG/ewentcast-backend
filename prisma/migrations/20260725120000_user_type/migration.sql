-- AlterTable
ALTER TABLE `users` ADD COLUMN `type` ENUM('user', 'admin') NOT NULL DEFAULT 'user';
