CREATE TABLE `provider_credentials` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`ciphertext` text NOT NULL,
	`iv` text NOT NULL,
	`models` text NOT NULL,
	`updated_at` text NOT NULL
);
