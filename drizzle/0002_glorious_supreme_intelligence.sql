CREATE TABLE `app_settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `content_recommendations` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`angle` text NOT NULL,
	`audience` text NOT NULL,
	`outline_json` text NOT NULL,
	`keywords_json` text NOT NULL,
	`predicted_score` integer DEFAULT 70 NOT NULL,
	`source_article_ids_json` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_content_recommendations_created_at` ON `content_recommendations` (`created_at`);--> statement-breakpoint
CREATE TABLE `content_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`source_type` text DEFAULT 'wechat' NOT NULL,
	`source_url` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_checked_at` text
);
--> statement-breakpoint
CREATE TABLE `radar_articles` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text,
	`source_name` text NOT NULL,
	`title` text NOT NULL,
	`url` text NOT NULL,
	`digest` text DEFAULT '' NOT NULL,
	`content_excerpt` text DEFAULT '' NOT NULL,
	`published_at` text,
	`read_count` integer DEFAULT 0 NOT NULL,
	`like_count` integer DEFAULT 0 NOT NULL,
	`hot_score` integer DEFAULT 60 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `radar_articles_url_unique` ON `radar_articles` (`url`);--> statement-breakpoint
CREATE INDEX `idx_radar_articles_hot_score` ON `radar_articles` (`hot_score`);--> statement-breakpoint
CREATE INDEX `idx_radar_articles_source_id` ON `radar_articles` (`source_id`);