ALTER TABLE `outbox` ADD `body_schema` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `response_schema` text DEFAULT 'api/deleted.response' NOT NULL;--> statement-breakpoint
ALTER TABLE `outbox` ADD `record_ids` text DEFAULT '[]' NOT NULL;