CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'openai' NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`api_key_ciphertext` text NOT NULL,
	`api_key_iv` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
