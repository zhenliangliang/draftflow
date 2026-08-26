CREATE TABLE `sync_records` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`title` text NOT NULL,
	`draft_media_id` text,
	`status` text NOT NULL,
	`error_code` integer,
	`error_message` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `wechat_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`app_id` text NOT NULL,
	`app_secret_ciphertext` text NOT NULL,
	`app_secret_iv` text NOT NULL,
	`default_author` text DEFAULT '编辑部' NOT NULL,
	`access_token_ciphertext` text,
	`access_token_iv` text,
	`token_expires_at` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wechat_accounts_app_id_unique` ON `wechat_accounts` (`app_id`);