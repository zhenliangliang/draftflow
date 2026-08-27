CREATE TABLE `custom_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`tag` text DEFAULT '自定义' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`config_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_custom_themes_updated_at` ON `custom_themes` (`updated_at`);