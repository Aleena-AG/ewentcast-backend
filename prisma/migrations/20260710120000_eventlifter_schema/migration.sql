-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(320) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `auth_source` ENUM('local', 'hightribe') NOT NULL DEFAULT 'local',
    `ht_user_id` VARCHAR(64) NULL,
    `email_verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uniq_users_email`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_sessions_token`(`token`),
    INDEX `idx_sessions_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token` VARCHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uniq_reset_token`(`token`),
    INDEX `idx_reset_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `subscriptions` (
    `user_id` BIGINT NOT NULL,
    `plan` VARCHAR(64) NOT NULL DEFAULT 'pro_monthly',
    `status` ENUM('trialing', 'active', 'canceled', 'past_due') NOT NULL DEFAULT 'trialing',
    `trial_ends_at` DATETIME(3) NULL,
    `current_period_end` DATETIME(3) NULL,
    `stripe_customer_id` VARCHAR(255) NULL,
    `stripe_subscription_id` VARCHAR(255) NULL,
    `money_back_refunded_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_subscriptions_stripe_customer`(`stripe_customer_id`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ht_connections` (
    `user_id` BIGINT NOT NULL,
    `ht_user_id` VARCHAR(64) NULL,
    `ht_token` TEXT NULL,
    `connected_at` DATETIME(3) NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_settings` (
    `user_id` BIGINT NOT NULL,
    `settings_json` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `id` TINYINT NOT NULL DEFAULT 1,
    `settings_json` JSON NOT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `master_events` (
    `id` VARCHAR(64) NOT NULL,
    `user_id` BIGINT NULL,
    `title` VARCHAR(500) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 150,
    `sold` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_master_events_user`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_refs` (
    `master_id` VARCHAR(64) NOT NULL,
    `channel` ENUM('hightribe', 'luma', 'eventbrite') NOT NULL,
    `event_id` VARCHAR(128) NOT NULL DEFAULT '',
    `ticket_id` VARCHAR(128) NULL,
    `url` VARCHAR(500) NULL,

    INDEX `idx_channel_event`(`channel`, `event_id`),
    PRIMARY KEY (`master_id`, `channel`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `attendees` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `master_id` VARCHAR(64) NOT NULL,
    `email` VARCHAR(320) NOT NULL,
    `name` VARCHAR(500) NOT NULL,
    `source_channel` ENUM('hightribe', 'luma', 'eventbrite') NOT NULL,
    `registered_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uniq_master_email`(`master_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `luma_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `title` VARCHAR(500) NOT NULL DEFAULT '',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `timezone` VARCHAR(64) NULL,
    `url` VARCHAR(500) NULL,
    `cover_url` VARCHAR(500) NULL,
    `location_json` JSON NULL,
    `meeting_url` VARCHAR(500) NULL,
    `status` VARCHAR(64) NULL,
    `payload_json` JSON NOT NULL,
    `synced_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_luma_user_start`(`user_id`, `start_at`),
    UNIQUE INDEX `uniq_luma_user_event`(`user_id`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `eventbrite_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `title` VARCHAR(500) NOT NULL DEFAULT '',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `timezone` VARCHAR(64) NULL,
    `url` VARCHAR(500) NULL,
    `cover_url` VARCHAR(500) NULL,
    `is_free` BOOLEAN NULL,
    `status` VARCHAR(64) NULL,
    `payload_json` JSON NOT NULL,
    `synced_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_eb_user_start`(`user_id`, `start_at`),
    UNIQUE INDEX `uniq_eb_user_event`(`user_id`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hightribe_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `external_id` VARCHAR(128) NOT NULL,
    `title` VARCHAR(500) NOT NULL DEFAULT '',
    `start_at` DATETIME(3) NULL,
    `end_at` DATETIME(3) NULL,
    `timezone` VARCHAR(64) NULL,
    `url` VARCHAR(500) NULL,
    `cover_url` VARCHAR(500) NULL,
    `location` VARCHAR(500) NULL,
    `status` VARCHAR(64) NULL,
    `payload_json` JSON NOT NULL,
    `synced_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_ht_user_start`(`user_id`, `start_at`),
    UNIQUE INDEX `uniq_ht_user_event`(`user_id`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `channel_bookings` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `channel` ENUM('hightribe', 'luma', 'eventbrite') NOT NULL,
    `external_id` VARCHAR(191) NOT NULL,
    `event_external_id` VARCHAR(128) NULL,
    `event_title` VARCHAR(500) NOT NULL DEFAULT '',
    `guest_name` VARCHAR(500) NOT NULL DEFAULT '',
    `guest_email` VARCHAR(320) NOT NULL,
    `status` VARCHAR(64) NULL,
    `ticket_count` INTEGER NULL,
    `registered_at` DATETIME(3) NOT NULL,
    `payload_json` JSON NOT NULL,
    `synced_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_bookings_user_channel`(`user_id`, `channel`, `registered_at`),
    UNIQUE INDEX `uniq_channel_booking`(`user_id`, `channel`, `external_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `channel` VARCHAR(64) NOT NULL,
    `method` VARCHAR(16) NOT NULL DEFAULT 'POST',
    `path` VARCHAR(255) NOT NULL DEFAULT '',
    `status_code` INTEGER NOT NULL,
    `outcome` VARCHAR(64) NULL,
    `payload_json` JSON NOT NULL,
    `headers_json` JSON NULL,
    `response_json` JSON NULL,
    `error_message` TEXT NULL,
    `duration_ms` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_webhook_logs_channel_created`(`channel`, `created_at`),
    INDEX `idx_webhook_logs_created`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sessions` ADD CONSTRAINT `fk_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `fk_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscriptions` ADD CONSTRAINT `fk_subscriptions_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ht_connections` ADD CONSTRAINT `fk_ht_connections_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_settings` ADD CONSTRAINT `fk_user_settings_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_refs` ADD CONSTRAINT `fk_channel_refs_master` FOREIGN KEY (`master_id`) REFERENCES `master_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendees` ADD CONSTRAINT `fk_attendees_master` FOREIGN KEY (`master_id`) REFERENCES `master_events`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `luma_events` ADD CONSTRAINT `fk_luma_events_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eventbrite_events` ADD CONSTRAINT `fk_eb_events_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hightribe_events` ADD CONSTRAINT `fk_ht_events_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `channel_bookings` ADD CONSTRAINT `fk_channel_bookings_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
