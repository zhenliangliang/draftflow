CREATE TABLE `article_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`header_markdown` text DEFAULT '' NOT NULL,
	`footer_markdown` text DEFAULT '' NOT NULL,
	`qr_code_url` text DEFAULT '' NOT NULL,
	`qr_caption` text DEFAULT '' NOT NULL,
	`show_previous_article` integer DEFAULT true NOT NULL,
	`previous_label` text DEFAULT '上一篇文章' NOT NULL,
	`default_previous_title` text DEFAULT '' NOT NULL,
	`default_previous_url` text DEFAULT '' NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_article_templates_updated_at` ON `article_templates` (`updated_at`);