CREATE TABLE `chain_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`device_id` text NOT NULL,
	`seq` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text NOT NULL,
	`device_time` text NOT NULL,
	`uptime_ms` integer NOT NULL,
	`boot_id` text NOT NULL,
	`gnss_time` text,
	`ref_server_time` text,
	`ref_uptime_ms` integer,
	`ref_boot_id` text,
	`prev_hash` text NOT NULL,
	`hash` text NOT NULL,
	`synced_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chain_entries_device_id_seq` ON `chain_entries` (`device_id`,`seq`);--> statement-breakpoint
CREATE INDEX `chain_entries_synced_at` ON `chain_entries` (`synced_at`);--> statement-breakpoint
CREATE TABLE `checkpoints` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`instruction` text,
	`tag_type` text NOT NULL,
	`tag_uid` text,
	`qr_payload` text,
	`lat_e7` integer,
	`lng_e7` integer,
	`accuracy_dm` integer,
	`photo_media_id` text,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checkpoints_site_id_tag_uid` ON `checkpoints` (`site_id`,`tag_uid`);--> statement-breakpoint
CREATE INDEX `checkpoints_qr_payload` ON `checkpoints` (`qr_payload`);--> statement-breakpoint
CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text,
	`name` text NOT NULL,
	`platform` text NOT NULL,
	`app_version` text NOT NULL,
	`enrolled_by` text NOT NULL,
	`enrolled_at` text NOT NULL,
	`revoked_at` text,
	`last_seen_at` text
);
--> statement-breakpoint
CREATE TABLE `incidents` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`category` text NOT NULL,
	`note` text,
	`occurred_at` text NOT NULL,
	`lat_e7` integer,
	`lng_e7` integer,
	`accuracy_dm` integer,
	`nearest_checkpoint_id` text,
	`scan_id` text,
	`chain_entry_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `incidents_shift_id` ON `incidents` (`shift_id`);--> statement-breakpoint
CREATE TABLE `kv` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_type` text NOT NULL,
	`owner_id` text NOT NULL,
	`sha256` text NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`local_uri` text NOT NULL,
	`taken_at` text NOT NULL,
	`uploaded_at` text
);
--> statement-breakpoint
CREATE INDEX `media_owner` ON `media` (`owner_type`,`owner_id`);--> statement-breakpoint
CREATE INDEX `media_uploaded_at` ON `media` (`uploaded_at`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`method` text NOT NULL,
	`path` text NOT NULL,
	`body` text,
	`idempotency_key` text NOT NULL,
	`acting_user_id` text,
	`created_at` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_error` text
);
--> statement-breakpoint
CREATE TABLE `report_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`site_id` text NOT NULL,
	`frequency` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`route_version_id` text NOT NULL,
	`schedule_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`time_limit_min` integer,
	`started_at` text,
	`finished_at` text,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rounds_shift_id` ON `rounds` (`shift_id`);--> statement-breakpoint
CREATE INDEX `rounds_schedule_id_scheduled_at` ON `rounds` (`schedule_id`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `route_version_checkpoints` (
	`route_version_id` text NOT NULL,
	`checkpoint_id` text NOT NULL,
	`position` integer NOT NULL,
	`walk_time_from_prev_s` integer,
	PRIMARY KEY(`route_version_id`, `position`)
);
--> statement-breakpoint
CREATE TABLE `route_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`version` integer NOT NULL,
	`walk_duration_s` integer,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `route_versions_route_id_version` ON `route_versions` (`route_id`,`version`);--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`name` text NOT NULL,
	`order_mode` text NOT NULL,
	`current_version_id` text,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `routes_site_id` ON `routes` (`site_id`);--> statement-breakpoint
CREATE TABLE `scans` (
	`id` text PRIMARY KEY NOT NULL,
	`round_id` text,
	`checkpoint_id` text,
	`method` text NOT NULL,
	`scanned_at` text NOT NULL,
	`lat_e7` integer,
	`lng_e7` integer,
	`accuracy_dm` integer,
	`is_mock` integer NOT NULL,
	`flags` text NOT NULL,
	`note` text,
	`chain_entry_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `scans_round_id` ON `scans` (`round_id`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`name` text NOT NULL,
	`weekdays` integer NOT NULL,
	`mode` text NOT NULL,
	`start_times` text,
	`interval_from` text,
	`interval_to` text,
	`interval_every_min` integer,
	`time_limit_min` integer,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `schedules_route_id` ON `schedules` (`route_id`);--> statement-breakpoint
CREATE TABLE `shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`device_id` text NOT NULL,
	`guard_id` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text,
	`closed_by` text,
	`chain_entry_id` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shifts_started_at` ON `shifts` (`started_at`);--> statement-breakpoint
CREATE TABLE `site_user` (
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`site_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `site_user_user_id` ON `site_user` (`user_id`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`timezone` text NOT NULL,
	`no_data_alert_after_min` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`pin_hash` text,
	`pin_salt` text,
	`pin_iterations` integer,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
