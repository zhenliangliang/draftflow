CREATE TABLE `radar_style_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`source_name` text NOT NULL,
	`summary` text NOT NULL,
	`audience` text NOT NULL,
	`content_focus_json` text NOT NULL,
	`tone_json` text NOT NULL,
	`title_patterns_json` text NOT NULL,
	`opening_patterns_json` text NOT NULL,
	`structure_patterns_json` text NOT NULL,
	`reasoning_patterns_json` text NOT NULL,
	`language_traits_json` text NOT NULL,
	`pacing` text NOT NULL,
	`ending_patterns_json` text NOT NULL,
	`do_rules_json` text NOT NULL,
	`avoid_rules_json` text NOT NULL,
	`sample_article_ids_json` text NOT NULL,
	`sample_count` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_style_profiles_source_id_unique` ON `radar_style_profiles` (`source_id`);--> statement-breakpoint
CREATE INDEX `idx_radar_style_profiles_updated_at` ON `radar_style_profiles` (`updated_at`);